import pandas as pd
from datasets import load_dataset
import nltk
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords 
from nltk.stem import SnowballStemmer
import string
import re
import random
import json
import joblib 
import numpy as np
import tensorflow as tf
from gensim.models import Word2Vec
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
import tensorflow as tf
from keras.models import Sequential
from keras.layers import Input, Masking, LSTM, Dropout, Dense
from keras.optimizers import Adam
from keras.callbacks import EarlyStopping

print("--- Iniciando script de entrenamiento ---")

# --- 1. Carga de Datos ---
print("Cargando datasets...")
df_combinado = pd.DataFrame()

try:
    df_xnli = pd.read_csv("hf://datasets/Harsit/xnli2.0_train_spanish/spanish_train.csv")
    df_xnli = df_xnli[['premise', 'hypothesis']].copy()
    df_xnli = df_xnli.rename(columns={'premise': 'pregunta', 'hypothesis': 'respuesta'})
    df_xnli['origen'] = 'xnli'
except Exception as e:
    print(f"Error loading xnli2.0_train_spanish: {e}")
    df_xnli = None

splits = {'train': 'train.json', 'validation': 'validation.json', 'test': 'test.json'}
try:
    df = pd.read_json("hf://datasets/benjleite/FairytaleQA-translated-spanish/" + splits["train"])
    df_fairytale = df[['question', 'answer']].copy()
    df_fairytale = df_fairytale.rename(columns={'question': 'pregunta', 'answer': 'respuesta'})
    df_fairytale['origen'] = 'fairytale'
except Exception as e:
    print(f"Error loading FairytaleQA: {e}")
    df_fairytale = None

try:
    ds = load_dataset("Kukedlc/spanish-train")
    df_spanish_train = ds['train'].to_pandas()
    df_spanish_train = df_spanish_train.rename(columns={'instruction': 'pregunta', 'output': 'respuesta'})
    df_spanish_train['origen'] = 'spa_train'
except Exception as e:
    print(f"Error loading spanish-train: {e}")
    df_spanish_train = None

dataframes_combinar = [df for df in [df_xnli, df_fairytale, df_spanish_train] if df is not None]
df_combinado = pd.concat(dataframes_combinar, ignore_index=True)
print(f"Datasets combinados. Total filas: {df_combinado.shape[0]}")

# --- 2. Limpieza y Preprocesamiento ---
print("Limpiando y preprocesando datos...")
df_combinado.dropna(subset=['pregunta', 'respuesta'], inplace=True)
df_combinado['pregunta'] = df_combinado['pregunta'].astype(str).str.strip()
df_combinado['respuesta'] = df_combinado['respuesta'].astype(str).str.strip()
df_combinado = df_combinado[(df_combinado['pregunta'] != '') & (df_combinado['respuesta'] != '')]

word_threshold = 150
df_combinado = df_combinado[
    (df_combinado['pregunta'].apply(lambda x: len(str(x).split())) <= word_threshold) &
    (df_combinado['respuesta'].apply(lambda x: len(str(x).split())) <= word_threshold)
]
df_combinado.drop_duplicates(inplace=True)
print(f"Filas después de limpieza: {df_combinado.shape[0]}")

sample_size = 2000
df_combinado_muestra = df_combinado.groupby('origen').apply(lambda x: x.sample(min(len(x), sample_size), random_state=32)).reset_index(drop=True)
print(f"Muestra estratificada tomada. Total filas: {df_combinado_muestra.shape[0]}")

def normalize_text(text):
    if isinstance(text, str):
        text = re.sub(r'[\n\t]', ' ', text)
        text = text.lower()
        text = re.sub(r'\bq\b', 'que', text)
        text = re.sub(r'\btoy\b', 'estoy', text)
        text = re.sub(r'\bd\b', 'de', text)
        text = re.sub(r'\bpa\b', 'para', text)
        text = re.sub(r'\bt\b', 'te', text)
        text = text.replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u')
        text = re.sub(r'\.$', '', text)
        text = text.replace('"', "'")
        text = re.sub(r'\s+', ' ', text).strip()
        return text
    else:
        return ""

df_combinado_muestra['pregunta'] = df_combinado_muestra['pregunta'].apply(normalize_text)
df_combinado_muestra['respuesta'] = df_combinado_muestra['respuesta'].apply(normalize_text)

def tokenize_text(text):
    if isinstance(text, str):
        text = re.sub(r'[^\w\s]', '', text)
        tokens = word_tokenize(text, language='spanish')
        return tokens
    else:
        return []

df_combinado_muestra['pregunta_tokenizada'] = df_combinado_muestra['pregunta'].apply(tokenize_text)
df_combinado_muestra['respuesta_tokenizada'] = df_combinado_muestra['respuesta'].apply(tokenize_text)
print("Tokenización completada.")

# --- 3. Guardar el DataFrame procesado ---
df_combinado_muestra.to_csv('datos_procesados.csv', index=False)
print("DataFrame procesado guardado en 'datos_procesados.csv'")


# --- 4. Entrenamiento de Word2Vec ---
print("Entrenando modelo Word2Vec...")
sentences = df_combinado_muestra['pregunta_tokenizada'].tolist() + df_combinado_muestra['respuesta_tokenizada'].tolist()

model_w2v = Word2Vec(sentences, vector_size=100, window=5, min_count=5, workers=4)
EMB_DIM = model_w2v.vector_size
model_w2v.save("model.w2v")
print("Modelo Word2Vec guardado en 'model.w2v'")

# --- 5. Helpers (Definidos aquí para el entrenamiento) ---
def tokens_to_vectors(tokens, emb_dim=EMB_DIM):
    if not tokens: return np.zeros((0, emb_dim), np.float32)
    return np.asarray([model_w2v.wv[t] if t in model_w2v.wv else np.zeros(emb_dim, np.float32)
                       for t in tokens], dtype=np.float32)

def sentence_mean(tokens):
    M = tokens_to_vectors(tokens)
    if M.size == 0: return np.zeros((EMB_DIM,), np.float32)
    mask = ~(M==0).all(axis=1)
    return M[mask].mean(axis=0).astype(np.float32) if mask.any() else np.zeros((EMB_DIM,), np.float32)

MAX_LEN = int(np.percentile(df_combinado_muestra['pregunta_tokenizada'].apply(len), 95))
MAX_LEN = max(16, min(MAX_LEN, 200))
print(f"MAX_LEN establecido en: {MAX_LEN}")

def pad_vectors(mat, max_len=MAX_LEN, emb_dim=EMB_DIM):
    out = np.zeros((max_len, emb_dim), np.float32)
    L = min(max_len, len(mat))
    if L>0: out[:L] = mat[:L]
    return out

# --- 6. Entrenamiento del Codificador LSTM ---
print("Preparando datos para LSTM...")
X = np.stack([pad_vectors(tokens_to_vectors(t)) for t in df_combinado_muestra['pregunta_tokenizada']], axis=0)
y = np.stack([sentence_mean(t) for t in df_combinado_muestra['respuesta_tokenizada']], axis=0)

def cosine_loss(y_true, y_pred):
    y_true = tf.math.l2_normalize(y_true, axis=1)
    y_pred = tf.math.l2_normalize(y_pred, axis=1)
    return 1.0 - tf.reduce_mean(tf.reduce_sum(y_true*y_pred, axis=1))

enc_model = Sequential([
    Input(shape=(MAX_LEN, EMB_DIM)),
    Masking(mask_value=0.0),
    LSTM(128, return_sequences=False),
    Dropout(0.3),
    Dense(128, activation='relu'),
    Dense(EMB_DIM, activation='linear')
])
enc_model.compile(optimizer=Adam(1e-3), loss=cosine_loss)

early_stopping_callback = EarlyStopping(
    monitor='val_loss', 
    patience=3, 
    restore_best_weights=True
)

print("Entrenando modelo LSTM...")
history = enc_model.fit(
    X, 
    y, 
    epochs=50, 
    batch_size=32, 
    validation_split=0.2, 
    verbose=1,
    callbacks=[early_stopping_callback]
)
enc_model.save("lstm_encoder_model.keras")
print("Modelo LSTM guardado en 'lstm_encoder_model.keras'")


# --- 7. Entrenamiento del Clasificador de Intenciones ---
print("Entrenando clasificador de intenciones...")

data_intents = {
  "saludo": [
    "hola", "buenas", "buenos dias", "que tal", "buenas tardes", "hey", "como estas", "hola, que tal", "buen dia", "holi"
  ],
  "pedir_objeto": [
    "dame la pelota", "quiero un juguete", "puedes darme el libro", "necesito mi mochila", "pasame el lapiz", "traeme un vaso de agua"
  ],
  "pedir_ayuda": [
    "ayúdame, por favor", "no entiendo", "no puedo hacerlo solo", "¿me puedes ayudar?", "¿cómo lo hago?"
  ],
  "expresar_gustos": [
    "me gusta esto", "no me gusta", "me encanta", "quiero eso", "prefiero esto"
  ],
  "pedir_permiso_para_jugar": [
    "¿puedo jugar?", "quiero ir a jugar, ¿puedo?", "¿me dejas jugar?", "creo que es hora de jugar", "¿puedo jugar ahora?" 
  ],
  "pedir_permiso_para_baño": [
    "¿puedo ir al baño?", "quiero ir al baño, ¿puedo?", "¿me dejas ir al baño?", "¿puedo usar el baño?", "¿es posible ir al baño?"
  ],
  "pedir_permiso_para_ver_tele": [
    "¿puedo ver televisión?", "quiero ver la televisión, ¿puedo?", "¿me dejas ver la televisión?", "¿puedo ver mi programa favorito?", "¿es hora de ver la televisión?"
  ],
  "pedir_permiso_para_salir": [
    "¿puedo ir al parque?", "¿me dejas salir a jugar?", "quiero salir, ¿puedo?", "¿puedo ir afuera?", "¿puedo ir a dar una vuelta?"
  ],
  "disculparse": [
    "lo siento mucho", "perdón", "no fue mi intención hacer eso", "me equivoqué, lo siento", "disculpa, fue un error", "perdón, te lastimé sin querer"
  ],
  "hacer_pregunta": [
    "¿dónde está mamá?", "¿qué es esto?", "¿cómo se llama eso?", "¿qué hora es?", "¿dónde está mi juguete?"
  ],
  "expresar_deseo": [
    "quiero jugar con mi muñeco", "me gustaría comer una pizza", "quiero ver una película", "deseo ir al parque", "me gustaría tener un perro"
  ],
  "expresar_logro": [
    "lo logré", "¡lo hice!", "¡terminé mi tarea!", "¡puedo hacerlo solo!", "¡lo conseguí!", "¡estoy orgulloso de mí!", "¡mira lo que hice!"
  ],
  "reconocer_logro": [
    "¡lo hiciste muy bien!", "lo lograste", "¡muy buen trabajo!", "¡estoy orgulloso de ti!", "pudiste lograrlo"
  ],
  "felicitar": [
    "¡fecilidades!", "¡feliz cumpleaños!", "¡que tengas un gran día!", "¡eres increíble!", "muchos éxitos"
  ],
  "expresar_agradecimiento": [
    "gracias", "¡mil gracias!", "gracias por ayudarme", "¡qué amable de tu parte!", "te lo agradezco de corazón", "¡qué bueno que me ayudaste!"
  ],
  "responder_afirmativamente": [
    "sí", "claro", "¡por supuesto!", "está bien", "de acuerdo", "¡claro que sí!"
  ],
  "responder_negativamente": [
    "no", "no quiero", "no puedo", "no me gusta", "no ahora", "no, gracias", "no quiero hacerlo"
  ],
  "expresar_miedo": [
    "tengo miedo", "me da miedo eso", "no quiero ir, me asusta", "estoy asustado", "eso me da mucho miedo", "me siento incómodo", "me da miedo la oscuridad", "tengo miedo de los perros"
  ],
  "expresar_tristeza": [
    "estoy triste", "me siento mal", "no quiero estar aquí, me siento triste", "estoy llorando", "me da pena", "no me siento bien"
  ],
  "expresar_alegria": [
    "estoy feliz", "¡qué bien me siento!", "¡estoy tan contento!", "me hace feliz esto", "estoy muy emocionado", "¡estoy muy contento de verte!", "¡esto es increíble!", "estoy sonriendo", "¡qué felicidad!"
  ],
  "expresar_frustracion": [
    "no puedo hacerlo", "¡esto es muy difícil!", "no me sale", "me frustra que no funcione", "no entiendo esto", "estoy cansado de intentarlo", "esto no está funcionando", "¡no puedo más!", "me siento frustrado"
  ],
  "expresar_sorpresa": [
    "¡qué sorpresa!", "no lo puedo creer", "¡wow, eso es increíble!", "¡eso es inesperado!", "¡qué increíble!", "me sorprende mucho", "nunca imaginé eso", "¡no esperaba eso!", "¡eso me dejó sin palabras!"
  ],
  "expresar_cansancio": [
    "estoy cansado", "me siento agotado", "quiero descansar", "estoy muy cansado", "no tengo fuerzas", "quiero dormir", "estoy muy cansado de jugar"
  ],
  "expresar_malestar": [
    "me siento mal", "tengo dolor de cabeza", "me duele la barriga", "no me siento bien", "me siento raro", "me siento enfermo", "tengo náuseas", "no me siento bien", "no me siento cómodo"
  ],
  "expresar_empatia": [
    "te entiendo", "debe ser difícil para ti", "estoy aquí para ayudarte", "lo siento, eso debe ser muy duro", "sé que estás pasando por un mal momento", "entiendo cómo te sientes", "estoy contigo, no estás solo"
  ],
  "expresar_confusión": [
    "no entiendo", "¿qué significa eso?", "no sé qué hacer", "estoy confundido", "eso no tiene sentido", "no sé qué quieres decir", "¿me puedes explicar otra vez?", "estoy perdido"
  ],
  "pedir_atencion": [
    "¿puedes escucharme?", "¿me puedes prestar atención?", "¡hola, mira esto!", "¿puedes mirarme?", "tengo algo importante que decir", "¿me puedes prestar atención, por favor?", "quiero contarte algo"
  ],
  "comentar_sobre_el_clima": [
    "está soleado hoy", "hace frío", "¿está lloviendo?", "hace calor", "¿te has fijado que hay nubes?" , "el día está bonito", "está nublado"
  ],
  "hablar_de_la_familia": [
    "mi mamá es muy linda", "tengo un hermano mayor", "mi papá trabaja mucho", "tengo una hermana pequeña", "¿tienes familia?", "mi abuela siempre me cuida", "mi primo me enseñó a jugar", "mi familia me quiere mucho", "mi mamá cocina muy bien"
  ],
  "preguntar_por_un_amigo": [
    "¿dónde está Juan?", "¿cómo está Ana?", "¿has visto a Marta?", "¿tu amigo está bien?","¿cómo está tu amigo?", "¿or qué no vino Tomás?", "¿puedes llamar a mi amigo?"
  ],
  "pedir_descanso": [
    "¿puedo descansar un momento?", "estoy cansado, quiero descansar", "necesito un descanso", "me siento agotado, ¿puedo descansar?", "¿puedo dormir un rato?", "estoy muy cansado", "me duele mucho, ¿puedo descansar?"
  ],
  "pedir_explicacion": [
    "¿me puedes explicar eso?", "no entiendo, ¿puedes decirlo de nuevo?", "no sé qué significa, ¿me lo puedes explicar?", "¿puedes explicarlo más despacio?", "¿qué significa eso?", "¿qué pasa, me lo puedes contar?", "¿por qué está pasando eso?", "no entiendo cómo hacerlo, ¿puedes ayudarme?"
  ],
  "hablar_de_la_escuela": [
    "hoy fue un día divertido en la escuela", "tengo tarea de matemáticas", "me gusta mucho mi escuela", "hoy aprendí algo nuevo en clase", "¿tienes escuela mañana?", "mi maestra es muy amable.", "vamos a tener una excursión en la escuela", "tengo una prueba de ciencias"
  ],
  "contar_cuento": [
    "dime un cuento", "estoy aburrido, ¿me cuentas un cuento?", "dime una historia", "¿me cuentas un cuento?", "cuéntame algo interesante"
  ],
  "solicitar_tiempo_de_calidad": [
    "¿podemos pasar tiempo juntos?", "quiero pasar un rato contigo", "¿me puedes dar tiempo para jugar?", "podemos hacer algo divertido juntos", "quiero estar contigo ahora", "me gustaría que jugáramos juntos", "¿puedes pasar tiempo conmigo?"
  ],
  "pedir_silencio": [
    "¡Shh! silencio, por favor", "necesito un poco de silencio", "por favor, guarda silencio", "¡silencio! Estoy concentrado", "¿podemos estar en silencio?", "por favor, no hables ahora", "necesito calma, ¿puedes estar en silencio?"
  ],
  "hablar_de_actividad_preferida": [
    "me encanta pintar", "me gusta mucho jugar al fútbol", "mi actividad favorita es bailar", "disfruto mucho construir con bloques", "prefiero jugar con mis juguetes", "mi actividad preferida es nadar"
  ],
  "preguntar_por_comida": [
    "¿qué vamos a comer?", "¿hay algo para cenar?", "¿puedo comer algo ahora?", "¿qué hay para almorzar?", "¿puedo tener una merienda?", "¿qué vamos a comer hoy?"
  ],
  "hablar_de_juego_favorito": [
    "mi juego favorito es el ajedrez", "me gusta jugar a los videojuegos", "mi juego preferido es el escondite", "mi juego favorito es el Lego", "mi juego preferido son las escondidas", "el mejor juego es el de la pelota"
  ],
  "expresar_hambre": [
    "tengo hambre", "me muero de hambre", "quiero comer algo", "tengo mucha hambre", "estoy hambriento", "me gustaría comer algo delicioso"
  ],
  "expresar_sed": [
    "tengo sed", "¿puedo tomar agua?", "quiero beber algo", "estoy muy sediento", "me gustaría un jugo", "¿puedo tomar un poco de agua?"
  ],
  "pedir_info_adicional": [
    "¿me puedes contar más?", "¿qué más sabes sobre eso?", "¿puedes darme más detalles?", "¿hay algo más que deba saber?", "quiero saber más sobre eso", "¿cómo puedo aprender más?"
  ],
  "jergas_amigos": [
    "¡qué onda!", "¡qué tal, bro!", "vamos a darle", "¡qué chido!", "¡todo bien, mi pana!", "¿qué pasa loco?", "¡estamos al cien!", "¡está de pelos!"
  ],
  "jergas_deportes": [
    "¡vamos con todo!", "¡dale, mete gol!", "¡eso fue un golazo!", "¡es un partido épico!", "¡a romperla!", "¡vamos a hacer una jugada maestra!", "¡esto está reñido!"
  ],
  "hablar_de_tareas": [
    "tengo mucha tarea hoy", "¿ya hiciste tu tarea?", "estoy haciendo mi tarea de matemáticas", "tengo que estudiar para la prueba", "¿me ayudas con la tarea?", "¿qué tarea tienes?" , "tengo que hacer un proyecto de ciencias", "¿tienes mucha tarea?"
  ],
  "hacer_una_pregunta_personal": [
    "¿cuántos años tienes?", "¿dónde vives?", "¿qué te gusta hacer en tu tiempo libre?", "¿tienes hermanos?", "¿cuál es tu color favorito?", "¿te gusta el fútbol?", "¿tienes mascota?", "¿cuál es tu comida favorita?", "¿qué haces en el fin de semana?", "¿tienes algún hobby?"
  ],
  "despedida": [
    "adiós", "hasta luego", "nos vemos", "chao", "hasta mañana", "bye", "nos vemos después"
  ]
}


rows=[]
for k,egs in data_intents.items():
    for t in egs: rows.append({"text": t, "intent": k})
df_int = pd.DataFrame(rows)

df_int["text_normalized"] = df_int["text"].apply(normalize_text)

spanish_stopwords = list(stopwords.words('spanish'))

clf_intents = Pipeline([
    ("tfidf", TfidfVectorizer(
        lowercase=True, 
        analyzer="word", 
        ngram_range=(1, 2), 
        stop_words=spanish_stopwords
    )),
    ("lr", LogisticRegression(max_iter=300, class_weight="balanced"))
]).fit(df_int["text_normalized"], df_int["intent"])

joblib.dump(clf_intents, "intent_classifier.joblib")
print("Clasificador de intenciones guardado en 'intent_classifier.joblib'")


print("\n--- [ENTRENAMIENTO COMPLETADO] ---")
print("Todos los modelos y datos han sido guardados.")
print("Archivos creados:")
print("- datos_procesados.csv")
print("- model.w2v")
print("- lstm_encoder_model.keras (carpeta)")
print("- intent_classifier.joblib")