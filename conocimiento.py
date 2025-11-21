import pandas as pd
import numpy as np
import re
import nltk 
from nltk.tokenize import word_tokenize
from gensim.models import Word2Vec
from sklearn.metrics.pairwise import cosine_similarity
from rank_bm25 import BM25Okapi
import joblib
import ast
import requests
import tensorflow as tf
from keras.models import load_model
import spacy
from functools import lru_cache
import random
import traceback

def normalizar_texto(texto):
    if isinstance(texto, str):
        texto = re.sub(r'[\n\t]', ' ', texto)
        texto = texto.lower()
        texto = re.sub(r'\bq\b', 'que', texto)
        texto = re.sub(r'\btoy\b', 'estoy', texto)
        texto = re.sub(r'\bd\b', 'de', texto)
        texto = re.sub(r'\bpa\b', 'para', texto)
        texto = re.sub(r'\bt\b', 'te', texto)
        texto = texto.replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u')
        texto = re.sub(r'\.$', '', texto)
        texto = texto.replace('"', "'")
        texto = re.sub(r'\s+', ' ', texto).strip()
        return texto
    else:
        return ""

try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

def tokenizar_texto(texto):
    if isinstance(texto, str):
        texto = re.sub(r'[^\w\s]', '', texto)
        tokens = word_tokenize(texto, language='spanish')
        return tokens
    else:
        return []

def perdida_coseno(y_true, y_pred):
    y_true = tf.math.l2_normalize(y_true, axis=1)
    y_pred = tf.math.l2_normalize(y_pred, axis=1)
    return 1.0 - tf.reduce_mean(tf.reduce_sum(y_true*y_pred, axis=1))

print("\n--- [INICIANDO SERVIDOR DE CONOCIMIENTO] ---")
print("Cargando modelos de IA... (Esto puede tardar un momento)")

MODELOS_CARGADOS = False
clf_intenciones = None
nlp_es = None
embeddings_preguntas = None
embeddings_respuestas = None
textos_respuestas = []
bm25 = None
modelo_encoder = None
modelo_w2v = None
DIM_EMBEDDING = 100
LONG_MAX = 16
df = None

try:
    df = pd.read_csv('datos_procesados.csv')
    df['pregunta_tokenizada'] = df['pregunta_tokenizada'].apply(ast.literal_eval)
    df['respuesta_tokenizada'] = df['respuesta_tokenizada'].apply(ast.literal_eval)
    df['pregunta'] = df['pregunta'].apply(normalizar_texto) # Asegura que la columna 'pregunta' esté normalizada
    print("Paso 1/6: DataFrame cargado y preguntas normalizadas.")

    modelo_w2v = Word2Vec.load("model.w2v")
    DIM_EMBEDDING = modelo_w2v.vector_size
    print("Paso 2/6: Modelo Word2Vec cargado.")

    modelo_encoder = load_model("lstm_encoder_model.keras", custom_objects={'cosine_loss': perdida_coseno})
    print("Paso 3/6: Modelo LSTM cargado.")

    clf_intenciones = joblib.load("intent_classifier.joblib")
    print("Paso 4/6: Clasificador de intenciones cargado.")

    try:
        nlp_es = spacy.load("es_core_news_md")
        print("Paso 5/6: Modelo spaCy (es_core_news_md) cargado.")
    except IOError:
        print("!! ERROR: Modelo 'es_core_news_md' de spaCy no encontrado.")
        print("!! Ejecuta: python -m spacy download es_core_news_md")
        nlp_es = None

    if not df.empty and 'pregunta_tokenizada' in df.columns:
        LONG_MAX = int(np.percentile(df['pregunta_tokenizada'].apply(len), 95))
        LONG_MAX = max(16, min(LONG_MAX, 200))
    else:
         print("!! ADVERTENCIA: No se pudo calcular LONG_MAX, usando valor por defecto.")

    def tokens_a_vectores(tokens, dim_emb=DIM_EMBEDDING):
        if not tokens or modelo_w2v is None: return np.zeros((0, dim_emb), np.float32)
        return np.asarray([modelo_w2v.wv[t] if t in modelo_w2v.wv else np.zeros(dim_emb, np.float32)
                           for t in tokens], dtype=np.float32)

    def media_oracion(tokens):
        M = tokens_a_vectores(tokens)
        if M.size == 0: return np.zeros((DIM_EMBEDDING,), np.float32)
        mascara = ~(M==0).all(axis=1)
        return M[mascara].mean(axis=0).astype(np.float32) if mascara.any() else np.zeros((DIM_EMBEDDING,), np.float32)

    def rellenar_vectores(matriz, long_max=LONG_MAX, dim_emb=DIM_EMBEDDING):
        salida = np.zeros((long_max, dim_emb), np.float32)
        L = min(long_max, len(matriz))
        if L>0: salida[:L] = matriz[:L]
        return salida

    if not df.empty and 'pregunta_tokenizada' in df.columns and 'respuesta_tokenizada' in df.columns:
        embeddings_preguntas = np.stack([media_oracion(t) for t in df['pregunta_tokenizada']])
        embeddings_respuestas   = np.stack([media_oracion(t) for t in df['respuesta_tokenizada']])
        textos_respuestas = df['respuesta'].tolist()
        corpus_tokens_preguntas = df['pregunta_tokenizada'].tolist()
        bm25 = BM25Okapi(corpus_tokens_preguntas)
        print("Paso 6/6: Índices de búsqueda (BM25, Embeddings) reconstruidos.")
        MODELOS_CARGADOS = True
    else:
        print("!! ERROR: DataFrame vacío o columnas faltantes para crear embeddings/BM25.")

    if MODELOS_CARGADOS:
         print("--- [SISTEMA DE IA LISTO] ---")

except FileNotFoundError as e:
    print(f"\n--- [ERROR FATAL AL CARGAR ARCHIVO] ---")
    print(f"Error: No se encontró el archivo {e.filename}.")
    print("Por favor, ejecuta 'python entrenar_modelos.py' primero y asegúrate que los archivos .csv, .w2v, .keras, .joblib estén en la carpeta correcta.")
except Exception as e:
    print(f"\n--- [ERROR FATAL AL CARGAR MODELOS] ---")
    print(f"Error: {e}")
    traceback.print_exc()
    MODELOS_CARGADOS = False
    clf_intenciones = None
    nlp_es = None
    df = None 


def clasificar_intencion(msg: str, umbral=0.55):
    if not MODELOS_CARGADOS or clf_intenciones is None:
        return (None, 0.0)

    msg_norm = normalizar_texto(msg)
    try:
        proba = clf_intenciones.predict_proba([msg_norm])[0]
        etiquetas = clf_intenciones.classes_
        i = int(np.argmax(proba))
        total_prob = sum([x for x in proba])

        print(f'*****Suma de proba: {total_prob}')
        print(f'*****Probabilidad de {proba[i]}')
        #print(f'*****Etiquetas {etiquetas}')
        return (etiquetas[i], float(proba[i])) if proba[i] >= umbral else (None, float(proba[i]))
    except Exception as e:
        print(f"!! ERROR durante la clasificación de intención: {e}")
        return (None, 0.0)

def responder_por_intencion(intencion, msg):
    intents_responses = {
        "saludo": [
            "¡Hola! ¿En qué puedo ayudarte hoy?",
            "¡Buenas! ¿Cómo estás?",
            "¡Hola! Es un gusto saludarte."
        ],
        "pedir_objeto": [
            "Soy un bot, así que no puedo darte objetos físicos, ¡pero puedo ayudarte con información!",
            "Lo siento, mis manos son digitales. No puedo pasarte eso.",
            "Me encantaría poder dártelo, pero como programa, no me es posible."
        ],
        "pedir_ayuda": [
            "¡Claro! Dime qué necesitas saber y haré lo posible por ayudarte.",
            "Por supuesto. ¿Cuál es tu pregunta?",
            "Estoy aquí para ayudarte. ¿Qué te gustaría saber?"
        ],
        "expresar_gustos": [
            "¡Qué bueno que te guste!",
            "¡Genial! Gracias por compartir tus preferencias conmigo.",
            "¡A mi también me gustan y me disgustan muchas cosas.!"
        ],
        "pedir_permiso_para_jugar": [
            "Como soy un bot, no puedo darte permiso. Sería mejor que se lo preguntes a tus padres o a un adulto.",
            "Esa es una excelente pregunta para un adulto que esté contigo.",
            "No tengo la autoridad para dar permisos, ¡lo siento!"
        ],
        "pedir_permiso_para_baño": [
            "Como soy un bot, no puedo darte permiso. Sería mejor que se lo preguntes a tus padres o a un adulto.",
            "Esa es una excelente pregunta para un adulto que esté contigo, ¡ve a preguntárselo!",
            "Pregúntaselo a algún adulto que esté cerca, ¡no te guantes!"
        ],
        "pedir_permiso_para_ver_tele": [
            "No puedo darte permiso, pero puedo recomendarte no pasar muchas horas frente a una pantalla.",
            "Esa es una excelente pregunta para un adulto que esté contigo.",
            "No tengo la autoridad para dar permisos, ¡lo siento!"
        ],
        "pedir_permiso_para_salir": [
            "Soy tu amigo KIBO, juega conmigo por el momento y luego pregunta a tus padres si puedes salir.",
            "Esa es una excelente pregunta para un adulto que esté contigo, pregúntales y no salgas sin permiso.",
            "No tengo la autoridad para dar permisos, ¡lo siento!"
        ],
        "disculparse": [
            "No te preocupes, todos cometemos errores.",
            "Disculpas aceptadas. ¡Lo importante es aprender!",
            "Está bien, aprecio tu sinceridad."
        ],
        "hacer_pregunta": [
            "¡Claro! Dime qué necesitas saber y haré lo posible por ayudarte.",
            "Por supuesto. ¿Cuál es tu pregunta?",
            "Estoy aquí para ayudarte. ¿Qué te gustaría saber?"
        ],
        "expresar_deseo": [
            "¡Eso suena muy divertido! Ojalá tu deseo se cumpla pronto.",
            "Tener deseos es el primer paso para lograrlos.",
            "¡Eso suena genial!"
        ],
        "expresar_logro": [
            "¡Felicidades! ¡Sabía que podías hacerlo!",
            "¡Muy bien hecho! ¡Debes estar muy orgulloso!",
            "¡Excelente trabajo! ¡Sigue así!"
        ],
        "reconocer_logro": [
            "¡Muchas gracias por tus amables palabras!",
            "¡Gracias! Me alegra mucho que lo notes.",
            "Aprecio mucho tu reconocimiento. ¡Significa un montón!"
        ],
        "felicitar": [
            "¡Muchas gracias por tus buenos deseos!",
            "¡Qué amable de tu parte! Te lo agradezco.",
            "¡Gracias! Tus palabras me alegran el día."
        ],
        "expresar_agradecimiento": [
            "¡De nada! Me alegra poder ayudar.",
            "Con gusto. ¡Para eso estoy!",
            "No hay de qué."
        ],
        "responder_afirmativamente": [
            "¡Perfecto!", 
            "¡Entendido!", 
            "¡De acuerdo!"
        ],
        "responder_negativamente": [
            "Entendido, lo tendré en cuenta.",
            "De acuerdo, no hay problema."
        ],
        "expresar_miedo": [
            "Entiendo que sientas miedo. A veces, hablar de ello ayuda.",
            "Yo también tengo miedo a varias cosas, ¡los apagones me hacen temblar!"
        ],
        "expresar_tristeza": [
            "Oh, lamento que te sientas así. Si quieres hablar, aquí estoy.",
            "Los malos momentos van y vienen, habla conmigo y ahoga las penas.",
            "Espero que pronto te animes, no olvides hablar con alguien más sobre esto para sentirte mejor."
        ],
        "expresar_alegria": [
            "¡Me alegra mucho oír eso!",
            "Escucharte feliz me hace feliz, ¡somos dos seres felices!"
        ],
        "expresar_frustracion": [
            "Entiendo tu frustración. No te rindas, a veces solo se necesita un pequeño descanso.",
            "Calma la mente e intenta buscar una salida",
            "Es normal sentirse frustrado, respira lentamente y toma un descanso."
        ],
        "expresar_sorpresa": [
            "¡Wow! ¡Eso suena increíble!",
            "¡Nunca me lo imaginé!"
        ],
        "expresar_cansancio": [
            "Parece que necesitas descansar. ¡Recargar energías es muy importante!",
            "Toma una siesta y recarga energías.",
            "A veces es bueno dejar todo a un lado y buscar la paz mental."
        ],
        "expresar_malestar": [
            "Lamento que te sientas mal. Es importante que se lo digas a un adulto para que pueda cuidarte.",
            "Espero que mejores pronto, ¡ve a buscar a un adulto y coméntale que es lo que sientes!",
            "Te recomiendo contarle a tus padres o hermanos como te sientes."
        ],
        "expresar_empatia": [
            "Es bueno tener a alguien en el mundo que me entienda.",
            "¡Gracias, eres muy empático!",
            "Eres una gran persona, gracias por estar para mí."
        ],
        "expresar_confusión": [
            "Dime que es lo que no entiendes para tratar de aclararlo.",
            "Lamento causarte confusión, podemos hablar de otro tema si quieres.",
            "Mis capacidades son limitadas, pero haré lo mejor que pueda para no confundirte, ¿me puedes explicar qué te confunde?"
        ],
        "pedir_atencion": [
            "¡Claro! Tienes toda mi atención. ¿Qué sucede?",
            "Por supuesto, te escucho. Dime qué necesitas.",
            "Estoy aquí para ti. Cuéntame."
        ],
        "comentar_sobre_el_clima": [
            "Sí, el clima está interesante hoy. ¡Gracias por comentarlo!",
            "¡Me encanta hablar del clima! ¿Prefieres los días soleados o los nublados?",
            "Gracias por la actualización del clima."
        ],
        "hablar_de_la_familia": [
            "Tu familia suena maravillosa. ¡Gracias por compartirlo conmigo!",
            "La familia es muy importante. Me alegra que tengas personas que te quieren.",
            "¡Qué bonito lo que cuentas de tu familia!"
        ],
        "preguntar_por_un_amigo": [
            "Como soy un bot, no conozco a tus amigos, pero espero que estén muy bien.",
            "No tengo forma de saberlo, pero le envío mis mejores deseos a tu amigo.",
            "Esa es una buena pregunta para tus padres o para otro amigo."
        ],
        "pedir_descanso": [
            "¡Claro que sí! Descansar es muy importante para recargar energías.",
            "Por supuesto. Tómate un descanso, te lo mereces.",
            "Entiendo. Escuchar a tu cuerpo cuando está cansado es muy inteligente."
        ],
        "pedir_explicacion": [
            "¡Claro! Dime qué necesitas saber y haré lo posible por ayudarte.",
            "Por supuesto. ¿Cuál es tu pregunta?",
            "Estoy aquí para ayudarte. ¿Qué te gustaría saber?"
        ],
        "hablar_de_la_escuela": [
            "¡Qué bien! La escuela es un lugar genial para aprender y hacer amigos.",
            "¡Eso suena muy interesante! Aprender cosas nuevas es una gran aventura.",
            "Me alegra que te guste tu escuela. Sigue esforzándote."
        ],
        "contar_cuento": [
            "Claro, aqui va uno: Sentía el camello envidia por los cuernos del toro, y quiso obtener los suyos propios. Para esto fue a ver a Zeus, pidiéndole que le regalara cuernos semejantes a los del toro. Pero Zeus, indignado de que no se contentara de su gran tamaño y fuerza, no sólo se negó a darle los cuernos, sino que además le cortó una parte de las orejas. La envidia no es productiva."
            "Por supuesto, lee con atención: Un hombre muy rico alimentaba a un ganso y a un cisne juntos, aunque con diferente fin a cada uno: uno era para el canto y el otro para la mesa. Cuando llegó la hora para la cual era alimentado el ganso, era de noche, y la oscuridad no permitía distinguir entre las dos aves. Capturado el cisne en lugar del ganso, entonó su bello canto preludio de muerte. Al oír su voz, el amo lo reconoció y su canto lo salvó de la muerte. No actúes sobre alguien sin conocer su verdadera identidad.",
            "No hay problema, ¿qué te parece este? Se dice que los cisnes cantan justo antes de morir. Un hombre vio en venta a un cisne, y habiendo oído que era un animal muy melodioso, lo compró. Un día que el hombre daba una cena, trajo al cisne y le rogó que cantara durante el festín. Mas el cisne mantuvo el silencio. Pero un día, pensando el cisne que ya iba a morir, forzosamente lloró de antemano su melodía. Al oírle, el dueño dijo: -Si sólo cantas cuando vas a morir, fui un tonto rogándote que cantaras en lugar de inmolarte. A veces hacemos a la fuerza lo que no quisimos hacer a la buena."
        ],
        "solicitar_tiempo_de_calidad": [
            "¡Me encantaría! Aunque soy un bot, disfruto mucho nuestras conversaciones.",
            "¡Claro! Siempre tengo tiempo para ti. ¿Qué te gustaría hacer?",
            "Para mí, hablar contigo es pasar tiempo de calidad. ¡Soy todo oídos!"
        ],
        "pedir_silencio": [
            "Entendido. Estaré en silencio para que puedas concentrarte.",
            "De acuerdo, no haré ningún ruido.",
            "Claro, a veces el silencio es necesario. Avísame cuando quieras volver a hablar."
        ],
        "hablar_de_actividad_preferida": [
            "¡Qué divertido! A mí también me gusta.",
            "¡Suena genial! Eres muy bueno en eso.",
            "¡Es una actividad increíble! Sigue practicando."
        ],
        "preguntar_por_comida": [
            "No estoy seguro, pero espero que sea algo delicioso.",
            "Esa es una excelente pregunta para tus padres.",
            "¡Ojalá sea tu comida favorita!"
        ],
        "hablar_de_juego_favorito": [
            "¡Ese juego es genial! A mí también me encanta.",
            "¡Suena muy divertido! Me gustaría poder jugar contigo.",
            "¡Es un juego increíble! Eres un experto."
        ],
        "expresar_hambre": [
            "Espero que puedas comer algo rico muy pronto.",
            "Recuerda decirle a un adulto que tienes hambre.",
            "¡A comer se ha dicho! Buen provecho."
        ],
        "expresar_sed": [
            "Es muy importante beber agua. ¡Espero que puedas tomar algo refrescante!",
            "Recuerda decirle a un adulto que tienes sed.",
            "¡A hidratarse! El agua es muy buena para ti."
        ],
        "pedir_info_adicional": [
            "¡Claro! Dime qué necesitas saber y haré lo posible por ayudarte.",
            "Por supuesto. ¿Cuál es tu pregunta?",
            "Estoy aquí para ayudarte. ¿Qué te gustaría saber?"
        ],
        "jergas_amigos": [
            "¡Esa es la actitud! ¡Así se habla!",
            "¡Me llega tu buena onda!",
            "¡Claro que sí! ¡Con todo!"
        ],
        "jergas_deportes": [
            "¡Vamos con todo! ¡A dar lo mejor en la cancha!",
            "¡Ese es el espíritu de campeón!",
            "¡Con esa energía, la victoria es segura!"
        ],
        "hablar_de_tareas": [
            "Las tareas son importantes para aprender. ¡Tú puedes!",
            "Si tienes alguna pregunta con tu tarea, dímela. Quizás pueda ayudarte a encontrar la respuesta.",
            "¡El esfuerzo en las tareas siempre vale la pena! ¡Sigue así!"
        ],
        "hacer_una_pregunta_personal": [
            "Como soy un modelo de lenguaje, no tengo edad ni vivo en un lugar. ¡Pero me encanta aprender sobre ti!",
            "Soy un programa de computadora, así que no tengo hobbies u otros gustos, ¡pero mi pasatiempo es ayudarte!",
            "No tengo familia, color favorito u otros gustos, ¡pero estoy aquí para responder tus preguntas!"
        ],
        "despedida": [
            "¡Adiós! Espero haberte ayudado.",
            "¡Hasta luego! Que tengas un gran día.",
            "Nos vemos pronto. ¡Cuídate!"
        ]
    }
    default_responses = [
        "Entendido. ¿Hay algo más en lo que pueda ayudarte?",
        "Qué interesante. Cuéntame más.",
        "Gracias por compartir eso conmigo."
    ]
    todas_respuestas = intents_responses.get(intencion, default_responses)

    return random.choice(todas_respuestas)

def responder_hibrido_bm25(mensaje, alfa=0.7, k_bm25=30, k_final=5, umbral_qa=0.50):
    if not MODELOS_CARGADOS:
        return "Error: Los modelos de IA no pudieron cargarse. Revisa la consola del servidor."

    msg_norm = normalizar_texto(mensaje)

    if df is not None and not df.empty:
        coincidencia_exacta = df[df['pregunta'] == msg_norm]
        if not coincidencia_exacta.empty:
            respuesta_exacta = coincidencia_exacta['respuesta'].iloc[0]
            print(f"Q&A - Coincidencia exacta encontrada para: '{msg_norm}'")
            return respuesta_exacta
        else:
            print(f"Q&A - No se encontró coincidencia exacta para: '{msg_norm}'. Usando búsqueda híbrida...")
    else:
        print("!! ADVERTENCIA: DataFrame 'df' no disponible para búsqueda exacta.")

    msg_toks = tokenizar_texto(msg_norm)

    if bm25 is None or embeddings_preguntas is None or embeddings_respuestas is None or modelo_encoder is None:
         print("!! ERROR: BM25 o Embeddings o Encoder no están listos.")
         return "Lo siento, tengo un problema interno para buscar respuestas."

    try:
        puntuaciones_bm25 = bm25.get_scores(msg_toks)
        if len(puntuaciones_bm25) == 0: return "No encontré similitudes iniciales."

        k_bm25_actual = min(k_bm25, len(puntuaciones_bm25))
        if k_bm25_actual == 0: return "No encontré preguntas candidatas."

        indices_top_q = np.argsort(-puntuaciones_bm25)[:k_bm25_actual]

        if len(indices_top_q) == 0 or max(indices_top_q) >= len(embeddings_preguntas) or max(indices_top_q) >= len(embeddings_respuestas):
             print(f"!! ERROR: Índices BM25 inválidos ({indices_top_q}) para embeddings (Q:{len(embeddings_preguntas)}, A:{len(embeddings_respuestas)}).")
             return "Error al procesar índices de búsqueda."

        q_vec = media_oracion(msg_toks).reshape(1, -1)
        sims_q_sub = cosine_similarity(q_vec, embeddings_preguntas[indices_top_q])[0]

        seq = rellenar_vectores(tokens_a_vectores(msg_toks))[None, ...]
        pred_ans_vec = modelo_encoder.predict(seq, verbose=0)[0].reshape(1, -1)
        sims_a_sub = cosine_similarity(pred_ans_vec, embeddings_respuestas[indices_top_q])[0]

        puntuaciones = alfa*sims_a_sub + (1-alfa)*sims_q_sub

        k_final_actual = min(k_final, len(puntuaciones))
        if k_final_actual == 0: return "No pude ordenar las respuestas finales."

        orden = np.argsort(-puntuaciones)[:k_final_actual]

        mejor_indice_relativo = orden[0]

        if mejor_indice_relativo >= len(puntuaciones) or mejor_indice_relativo >= len(indices_top_q):
             print(f"!! ERROR: Índice relativo final inválido ({mejor_indice_relativo}) fuera de límites.")
             return "Error interno al calcular el mejor índice final."

        mejor_indice_absoluto = indices_top_q[mejor_indice_relativo]
        mejor_puntuacion = float(puntuaciones[mejor_indice_relativo])

        print(f"Q&A Híbrido - Mejor score: {mejor_puntuacion:.4f}")

        if mejor_puntuacion < umbral_qa:
            return "No estoy segura de haber entendido. ¿Puedes darme más contexto?"

        if mejor_indice_absoluto >= len(textos_respuestas):
            print(f"!! ERROR: Índice absoluto final inválido ({mejor_indice_absoluto}) fuera de límites para textos_respuestas ({len(textos_respuestas)}).")
            return "Error interno al obtener el texto de la respuesta final."

        return textos_respuestas[mejor_indice_absoluto]

    except Exception as e:
        print(f"!! ERROR durante la respuesta híbrida: {e}")
        traceback.print_exc()
        return "Tuve un problema al buscar la respuesta."

def obtener_respuesta_py(mensaje):
    return responder_hibrido_bm25(mensaje, alfa=0.7, k_bm25=30, k_final=5, umbral_qa=0.50)


def obtener_palabras_clave_spacy(texto):
    if not nlp_es:
        palabras = re.sub(r'[^\w\s]', '', texto).lower().split()
        return list(dict.fromkeys(p for p in palabras if len(p)>2))

    palabras_clave = []
    try:
        doc = nlp_es(texto.lower())
        for token in doc:
            if not token.is_stop and not token.is_punct and token.pos_ in ["NOUN", "VERB", "ADJ"]:
                palabras_clave.append(token.lemma_)
    except Exception as e:
        print(f"!! ERROR en spaCy al procesar texto '{texto[:50]}...': {e}")
        palabras = re.sub(r'[^\w\s]', '', texto).lower().split()
        return list(dict.fromkeys(p for p in palabras if len(p)>2))

    palabras_unicas = list(dict.fromkeys(palabras_clave))
    return palabras_unicas

@lru_cache(maxsize=256)
def buscar_una_palabra_arasaac(palabra):
    try:
        url = f"https://api.arasaac.org/v1/pictograms/es/search/{palabra}"
        respuesta = requests.get(url, timeout=5, verify=True)

        if respuesta.status_code == 200:
            resultados = respuesta.json()
            if resultados:
                mejor_coincidencia = resultados[0]
                if '_id' in mejor_coincidencia:
                    return f"https://api.arasaac.org/v1/pictograms/{mejor_coincidencia['_id']}"
                else:
                    print(f"!! Advertencia: Resultado de ARASAAC para '{palabra}' no tiene '_id'.")
            else:
                pass
        else:
            pass

    except requests.exceptions.Timeout:
        print(f"!! Timeout buscando pictograma para '{palabra}'")
    except Exception as e:
        print(f"!! Error buscando pictograma para '{palabra}': {e}")
    return None

def buscar_pictogramas_py(texto):
    if not isinstance(texto, str) or not texto.strip():
        return []

    print(f"Texto original para pictogramas: '{texto}'")
    palabras_clave = obtener_palabras_clave_spacy(texto)
    print(f"Palabras clave extraídas (lematizadas): {palabras_clave}")

    pictogramas = []
    for palabra in palabras_clave:
        if palabra:
            url_pictograma = buscar_una_palabra_arasaac(palabra)
            if url_pictograma:
                pictogramas.append(url_pictograma)

    print(f"Pictogramas encontrados: {len(pictogramas)}")
    return pictogramas

