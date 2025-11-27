import os
import re
import requests
import firebase_admin
from firebase_admin import credentials, firestore, auth
from flask import Flask, render_template, request, jsonify, url_for
import joblib
import random
import traceback
import json
import io
import tempfile 
import black 
import datetime
import time
import nltk


from conocimiento import (
    obtener_respuesta_py,
    buscar_pictogramas_py,
    clasificar_intencion,
    responder_por_intencion,
    MODELOS_CARGADOS,
    normalizar_texto
)
from faster_whisper import WhisperModel

app = Flask(__name__)

INITIAL_CLASSIFICATION_THRESHOLD = 0.03
db = None
clf_intenciones = None
whisper_model = None

try:
    firebase_cred_json_str = os.environ.get('FIREBASE_CREDENTIALS_JSON')
    if firebase_cred_json_str:
        firebase_cred_dict = json.loads(firebase_cred_json_str)
        cred = credentials.Certificate(firebase_cred_dict)
        print("Credenciales de Firebase cargadas desde variable de entorno.")
    else:
        cred = credentials.Certificate('tu-service-account.json')
        print("Credenciales de Firebase cargadas desde archivo local.")

    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Firebase Admin SDK inicializado correctamente.")
except FileNotFoundError:
    print("ERROR CRÍTICO: No se encontró 'tu-service-account.json' ni variable de entorno.")
    db = None
except Exception as e:
    print(f"ERROR: No se pudo inicializar Firebase Admin.")
    print(f"Detalle del error: {e}")
    db = None

print("Descargando recursos de NLTK (punkt y punkt_tab)...")
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')
try:
    nltk.data.find('tokenizers/punkt_tab')
except LookupError:
    nltk.download('punkt_tab')
print("Recursos de NLTK listos.")


print("Cargando clasificador de intenciones...")
try:
    clf_intenciones = joblib.load("intent_classifier.joblib")
    print("Clasificador de intenciones cargado correctamente.")
except Exception as e:
    print(f"ERROR al cargar 'intent_classifier.joblib': {e}")
    clf_intenciones = None

print("Cargando modelo de transcripción Whisper (local)...")
try:
    whisper_model = WhisperModel("medium", device="cpu", compute_type="int8")
    print("Modelo Whisper cargado correctamente.")
except Exception as e:
    print(f"ERROR al cargar el modelo Whisper: {e}")
    print("La transcripción de audio no funcionará.")
    whisper_model = None


def leer_script_entrenamiento():
    script_path = 'entrenar_modelos.py'
    try:
        with open(script_path, 'r', encoding='utf-8') as f:
            contenido = f.read()
        titulo = script_path
        descripcion = "Script principal para cargar datos, preprocesarlos y entrenar los modelos de IA (Word2Vec, LSTM Encoder, Clasificador de Intenciones)."
        return titulo, descripcion, contenido
    except FileNotFoundError:
        print(f"!! ADVERTENCIA: No se encontró el archivo '{script_path}' para mostrar en la sección Algoritmos.")
        return "Archivo no encontrado", "Error al cargar el script.", "# Error: El archivo entrenar_modelos.py no se encontró en el servidor."
    except Exception as e:
        print(f"!! ERROR al leer '{script_path}': {e}")
        return "Error de lectura", "Error al cargar el script.", f"# Error al leer el archivo: {e}"

def _generate_and_save_bot_response(user_text, chat_id):
    if db is None:
        print("!! ERROR FATAL (Helper): La conexión con Firestore no está disponible.")
        return

    start_time_internal = time.time()
    try:
        print(f"\n--- [Generando respuesta para ChatID: {chat_id}] ---")
        print(f"Texto de entrada: {user_text}")

        try:
            today_str = datetime.date.today().strftime('%Y-%m-%d')
            metrics_ref = db.collection('botMetrics').document(today_str)
            topic_for_metrics = "general"
            
            if user_text != "[RUIDO_DETECTADO]" and clf_intenciones and MODELOS_CARGADOS:
                normalized_user_text_metrics = normalizar_texto(user_text)
                intent_raw, _ = clasificar_intencion(normalized_user_text_metrics, umbral=INITIAL_CLASSIFICATION_THRESHOLD)
                if intent_raw:
                    if 'python' in intent_raw or 'py' in intent_raw: topic_for_metrics = "python"
                    elif 'database' in intent_raw or 'sql' in intent_raw: topic_for_metrics = "database"
                    elif 'algoritmo' in intent_raw: topic_for_metrics = "algoritmos"
            
            metrics_ref.set({
                'totalQueries': firestore.Increment(1),
                f'topicCounts.{topic_for_metrics}': firestore.Increment(1)
            }, merge=True)
        except Exception as metrics_e:
            print(f"!! ADVERTENCIA: No se pudo actualizar métricas de query: {metrics_e}")

        bot_response_text = ""
        
        if user_text == "[RUIDO_DETECTADO]" or user_text == "[No se pudo entender el audio]":
            print("CASO: Audio con ruido. Generando respuesta de reintento.")
            bot_response_text = "Escuché mucho ruido de fondo o no detecté una voz clara. Por favor, trata de enviar de nuevo el audio o inténtalo de nuevo más tarde."
        
        else:
            intent = None
            score = 0.0

            if clf_intenciones and MODELOS_CARGADOS:
                normalized_user_text = normalizar_texto(user_text)
                intent_raw, score = clasificar_intencion(normalized_user_text, umbral=INITIAL_CLASSIFICATION_THRESHOLD)
                
                if intent_raw:
                    print(f"Intención detectada -> {intent_raw} (Confianza: {score:.2f})")
                    CONVERSATIONAL_INTENTS = ['saludo', 'despedida', 'agradecimiento', 'error', 'desconocido','pedir_objeto', 'pedir_ayuda', 'expresar_gustos','pedir_permiso_para_jugar', 'pedir_permiso_para_baño','pedir_permiso_para_ver_tele', 'pedir_permiso_para_salir','disculparse', 'hacer_pregunta', 'expresar_deseo', 'expresar_logro', 'reconocer_logro', 'felicitar', 'expresar_agradecimiento', 'responder_afirmativamente', 
        'responder_negativamente', 'expresar_miedo', 'expresar_tristeza', 
        'expresar_alegria', 'expresar_frustracion', 'expresar_sorpresa', 
        'expresar_cansancio', 'expresar_malestar', 'expresar_empatia', 
        'expresar_confusión', 'pedir_atencion', 'comentar_sobre_el_clima', 
        'hablar_de_la_familia', 'preguntar_por_un_amigo', 'pedir_descanso', 
        'pedir_explicacion', 'hablar_de_la_escuela', 'contar_cuento', 
        'solicitar_tiempo_de_calidad', 'pedir_silencio', 
        'hablar_de_actividad_preferida', 'preguntar_por_comida', 
        'hablar_de_juego_favorito', 'expresar_hambre', 'expresar_sed', 
        'pedir_info_adicional', 'jergas_amigos', 'jergas_deportes', 
        'hablar_de_tareas', 'hacer_una_pregunta_personal'
    ] 
                    
                    if intent_raw in CONVERSATIONAL_INTENTS:
                        intent = intent_raw
                        respuesta_simple = responder_por_intencion(intent, normalized_user_text)
                        
                        if intent == 'saludo':
                            bot_response_text = random.choice(["¡Hola! ¿En qué puedo ayudarte hoy?", "¡Hola! ¿Cómo estás?", "¡Qué gusto saludarte!"])
                        elif respuesta_simple:
                            bot_response_text = respuesta_simple
                        else:
                            bot_response_text = "No estoy seguro de cómo responder a eso, ¿puedes intentarlo de otra manera?"
                    else: 
                        print(f"Intención técnica detectada. Pasando a Q&A.")
                
            if not bot_response_text:
                if not MODELOS_CARGADOS:
                    bot_response_text = "Lo siento, tengo problemas para acceder a la base de conocimiento." 
                else:
                    print("Consultando modelo Q&A...")
                    bot_response_text = obtener_respuesta_py(user_text) 

        chat_ref = db.collection('chats').document(chat_id)
        
        code_pattern = re.compile(r"```(\w*)\s*(.*?)\s*```", re.DOTALL)
        matches = list(code_pattern.finditer(bot_response_text))
        
        if not matches:
            pictogramas = buscar_pictogramas_py(bot_response_text)
            bot_message = {
                'type': 'bot',
                'text': bot_response_text,
                'pictogramas': pictogramas,
                'timestamp': firestore.SERVER_TIMESTAMP,
                'contentType': 'text',
                'rating': 0
            }
            chat_ref.collection('messages').add(bot_message)
        else:
            last_index = 0
            for match in matches:
                texto_antes = bot_response_text[last_index:match.start()].strip()
                if texto_antes:
                    pictogramas_antes = buscar_pictogramas_py(texto_antes)
                    chat_ref.collection('messages').add({
                        'type': 'bot',
                        'text': texto_antes,
                        'pictogramas': pictogramas_antes,
                        'timestamp': firestore.SERVER_TIMESTAMP,
                        'contentType': 'text',
                        'rating': 0
                    })
                
                lenguaje = match.group(1).strip().lower() or "código"
                contenido_original = match.group(2).strip()
                contenido_formateado = contenido_original
                
                if lenguaje == 'python' or lenguaje == 'py':
                    try:
                        contenido_formateado = black.format_str(contenido_original, mode=black.Mode())
                    except:
                        contenido_formateado = contenido_original 
                
                chat_ref.collection('messages').add({
                    'type': 'bot',
                    'text': ' ',
                    'pictogramas': [],
                    'timestamp': firestore.SERVER_TIMESTAMP,
                    'contentType': 'code',
                    'codeLanguage': lenguaje,
                    'codeContent': contenido_formateado,
                    'rating': 0 
                })
                last_index = match.end()

            texto_despues = bot_response_text[last_index:].strip()
            if texto_despues:
                pictogramas_despues = buscar_pictogramas_py(texto_despues)
                chat_ref.collection('messages').add({
                    'type': 'bot',
                    'text': texto_despues,
                    'pictogramas': pictogramas_despues,
                    'timestamp': firestore.SERVER_TIMESTAMP,
                    'contentType': 'text',
                    'rating': 0
                })
                        
        print(f"Mensaje guardado en Firestore. Fin del proceso.")
        
        end_time_internal = time.time()
        print(f"--- [TIEMPO IA]: {end_time_internal - start_time_internal:.4f}s ---")

    except Exception as e:
        print(f"\n--- [ERROR RESPONDING] --- {e}")
        traceback.print_exc() 
        if db:
            db.collection('chats').document(chat_id).collection('messages').add({
                'type': 'bot',
                'text': 'Lo siento, he encontrado un error interno.',
                'pictogramas': [],
                'timestamp': firestore.SERVER_TIMESTAMP,
                'contentType': 'text',
                'rating': 0
            })

@app.route('/api/admin/create_user', methods=['POST'])
def admin_create_user():
    if db is None:
        return jsonify({"error": "Error interno del servidor: La base de datos no está conectada."}), 500

    try:
        data = request.json
        name = data.get('name')
        email = data.get('email')
        password = data.get('password')
        role = data.get('role')
        
        if not all([name, email, password, role]):
            return jsonify({"error": "Faltan datos obligatorios (nombre, email, contraseña, rol)."}), 400
            
        if len(password) < 6:
            return jsonify({"error": "La contraseña debe tener al menos 6 caracteres."}), 400

        avatar_url = f"https://api.dicebear.com/8.x/initials/svg?seed={requests.utils.quote(name)}"

        user = auth.create_user(
            email=email,
            password=password,
            display_name=name,
            photo_url=avatar_url,
            email_verified=False
        )

        db.collection('users').document(user.uid).set({
            'name': name,
            'email': email,
            'role': role,
            'avatarUrl': avatar_url,
            'tutorialVisto': False
        })
        
        print(f"Usuario {name} creado exitosamente con UID: {user.uid}")

        return jsonify({"status": "success", "uid": user.uid}), 201

    except firebase_admin.exceptions.FirebaseError as fe:
        error_message = str(fe)
        if 'email already exists' in error_message:
             return jsonify({"error": "El correo electrónico ya está en uso."}), 409
        
        print(f"Error de Firebase Admin: {fe}")
        return jsonify({"error": f"Error de Firebase Admin: {error_message}"}), 500
        
    except Exception as e:
        print(f"Error inesperado al crear usuario: {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno al procesar la solicitud."}), 500


@app.route('/index_alumno')
def index_alumno():
    return render_template('index_alumno.html')

@app.route('/index_profesor')
def index_profesor():
    return render_template('index_profesor.html')

@app.route('/index_padre')
def index_padre():
    return render_template('index_padre.html')

@app.route('/index_desarrollador')
def index_desarrollador():
    titulo_algoritmo, desc_algoritmo, codigo_algoritmo = leer_script_entrenamiento() 
    return render_template('index_desarrollador.html',
                           algoritmo_titulo=titulo_algoritmo,
                           algoritmo_descripcion=desc_algoritmo,
                           algoritmo_codigo=codigo_algoritmo)

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/login')
def login():
    return render_template('login.html')


@app.route('/api/get_bot_response', methods=['POST'])
def handle_chat_message():
    if db is None:
        print("!! ERROR FATAL: La conexión con Firestore no está disponible.")
        return jsonify({"error": "Error interno del servidor al conectar con la base de datos."}), 500

    start_time = time.time()
    try:
        print("\n--- [NUEVA SOLICITUD DE TEXTO RECIBIDA] ---")
        data = request.json
        user_text = data.get('text')
        chat_id = data.get('chatId')

        if not user_text or not chat_id:
            print("!! ERROR: Faltan parámetros 'text' o 'chatId'.")
            return jsonify({"error": "Faltan los parámetros 'text' o 'chatId'"}), 400

        _generate_and_save_bot_response(user_text, chat_id)

        response_time = time.time() - start_time
        _update_response_metrics(response_time, success=True)
        
        print("Paso 7: Enviando respuesta JSON de éxito al cliente.")
        return jsonify({"status": "success", "response_saved": True}), 200

    except Exception as e:
        response_time = time.time() - start_time
        _update_response_metrics(response_time, success=False)
        
        print(f"\n--- [ERROR INESPERADO EN /api/get_bot_response] ---")
        print(f"Error: {e}")
        traceback.print_exc()
        return jsonify({"error": "Ocurrió un error interno en el servidor."}), 500


@app.route('/api/process_audio', methods=['POST'])
def process_audio():
    if db is None:
        print("!! ERROR FATAL: La conexión con Firestore no está disponible.")
        return jsonify({"error": "Error interno del servidor al conectar con la base de datos."}), 500
        
    if whisper_model is None:
        print("!! ERROR: El modelo Whisper no está cargado. No se puede transcribir.")
        return jsonify({"error": "Servicio de transcripción no disponible."}), 503

    start_time = time.time()
    try:
        print("\n--- [NUEVA SOLICITUD DE AUDIO RECIBIDA] ---")
        data = request.json
        audio_url = data.get('audioUrl')
        chat_id = data.get('chatId')
        message_id = data.get('messageId')

        if not all([audio_url, chat_id, message_id]):
            print("!! ERROR: Faltan parámetros 'audioUrl', 'chatId' o 'messageId'.")
            return jsonify({"error": "Faltan parámetros en la solicitud."}), 400

        print(f"Procesando audio para ChatID {chat_id}, MsgID {message_id}")

        response = requests.get(audio_url)
        response.raise_for_status()
        
        temp_dir = tempfile.gettempdir() 
        temp_path = os.path.join(temp_dir, f"{message_id}.webm")
        with open(temp_path, "wb") as f:
            f.write(response.content)
        print(f"Archivo de audio guardado temporalmente en: {temp_path}")

        segments, info = whisper_model.transcribe(
            temp_path, 
            language="es", 
            vad_filter=True, 
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        
        valid_segments = []
        print("Analizando calidad de segmentos de audio...")

        for segment in segments:
            if segment.no_speech_prob > 0.6:
                print(f"  -> Segmento ignorado (Ruido/Silencio - Prob: {segment.no_speech_prob:.2f})")
                continue
            
            valid_segments.append(segment.text)

        transcribed_text = " ".join(valid_segments).strip()
        
        os.remove(temp_path)
        print("Archivo temporal eliminado.")

        user_display_text = transcribed_text
        
        if not transcribed_text:
            print("Resultado: El audio era solo ruido o no se detectó voz clara.")
            transcribed_text = "[RUIDO_DETECTADO]"
            user_display_text = "🔇 [Audio no entendido / Ruido]"

        print(f"Texto final a procesar: {transcribed_text}")

        message_ref = db.collection('chats').document(chat_id).collection('messages').document(message_id)
        message_ref.update({
            "text": user_display_text
        })
        print("Mensaje de audio en Firestore actualizado.")

        _generate_and_save_bot_response(transcribed_text, chat_id)

        response_time = time.time() - start_time
        _update_response_metrics(response_time, success=True)

        return jsonify({"status": "success", "transcription": transcribed_text}), 200

    except Exception as e:
        response_time = time.time() - start_time
        _update_response_metrics(response_time, success=False)
    
        print(f"\n--- [ERROR INESPERADO EN /api/process_audio] ---")
        print(f"Error: {e}")
        traceback.print_exc()
        
        try:
            if 'message_ref' in locals() and message_ref:
                message_ref.update({
                    "text": "[Error al transcribir el audio]"
                })
        except Exception as db_e:
            print(f"!! ERROR: No se pudo guardar el error de transcripción en Firestore: {db_e}")
            
        return jsonify({"status": "error", "message": str(e)}), 500

def _update_response_metrics(response_time, success=True):
    try:
        today_str = datetime.date.today().strftime('%Y-%m-%d')
        metrics_ref = db.collection('botMetrics').document(today_str)
        
        doc = metrics_ref.get()
        
        avg_speed = response_time
        success_rate = 100 if success else 0
        
        if doc.exists:
            data = doc.to_dict()
            n = data.get('totalQueries', 1) 
            if n == 0: n = 1 
            
            current_avg = data.get('avgResponseSpeed', 0)
            avg_speed = ((current_avg * (n - 1)) + response_time) / n
            
            current_rate = data.get('successRate', 0)
            current_success_decimal = current_rate / 100
            new_success_val = 1 if success else 0
            new_rate_decimal = ((current_success_decimal * (n - 1)) + new_success_val) / n
            success_rate = new_rate_decimal * 100

        metrics_ref.set({
            'avgResponseSpeed': avg_speed,
            'successRate': success_rate
        }, merge=True)
        
        print(f"Métricas de respuesta actualizadas: Speed={avg_speed:.2f}s, Success={success_rate:.1f}%")

    except Exception as e:
        print(f"!! ADVERTENCIA: No se pudo actualizar métricas de respuesta: {e}")


if __name__ == '__main__':
    app.run(debug=True, port=5000)