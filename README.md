<table>
<tr>
<td style="vertical-align: top; width: 100px; padding-right: 15px; border: none;">
<img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ45DITH77up1n8tb7Bx2n7TO8tBq4I65ZIuw&s", align="left">
</td>
<td style="vertical-align: top; border: none;">
<h1>Universidad Peruana de Ciencias Aplicadas</h1>
<h2>1ASI0404 – Inteligencia Artificial</h2>
<p><strong>Sección:</strong> 5215</p>
<p><strong>Profesor:</strong> Diego Rojas Sihuay</p>
</td>
</tr>
</table>

## 🧑‍💻🤖 KIBO - Chatbot Asistente con Soporte de Pictogramas

KIBO es un chatbot conversacional desarrollado en Python con Flask, diseñado para actuar como un asistente inteligente 🧠. Su principal objetivo es comprender y responder a las entradas del usuario utilizando una combinación de técnicas de Procesamiento de Lenguaje Natural (NLP) y Machine Learning, con un enfoque especial en la accesibilidad a través de la integración de pictogramas ARASAAC ✨.

## 🤖 Funcionalidades Principales

1.  **🔄 Sistema Híbrido de Respuestas:**
    * **👋 Reconocimiento de Intenciones:** Para consultas comunes y directas (saludos, expresiones emocionales, peticiones simples), KIBO utiliza un clasificador de intenciones (entrenado con Scikit-learn) para proporcionar respuestas rápidas y predefinidas.
    * **🔍 Búsqueda y Recuperación Q&A:** Para preguntas más complejas o que no coinciden con una intención simple, KIBO emplea un sistema avanzado de búsqueda:
        * 🎯 Busca coincidencias exactas primero en su base de conocimiento (`datos_procesados.csv`).
        * 🧠 Si no hay coincidencia exacta, combina BM25 (similitud textual) con Embeddings Semánticos (Word2Vec + LSTM Keras/TensorFlow) para encontrar la respuesta más relevante del dataset.
2.  **🖼️ Integración de Pictogramas ARASAAC:**
    * Para mejorar la comprensión y accesibilidad, KIBO analiza cada respuesta con `spaCy` para extraer palabras clave (sustantivos, verbos, adjetivos).
    * Busca automáticamente pictogramas para estas palabras en la API de ARASAAC y los muestra junto al texto.
3.  **🌐 Interfaz Web Interactiva:**
    * Frontend desarrollado con HTML, CSS y JavaScript para una interacción fluida.
    * Utiliza Firebase Firestore 🗃️ para almacenar el historial de conversaciones.

## 🛠️ Tecnologías Utilizadas

* **🐍 Backend:** Python, Flask
* **🤖 NLP/ML:** TensorFlow/Keras (LSTM), Scikit-learn (Intenciones), spaCy (Palabras Clave), NLTK (Tokenización), Gensim (Word2Vec)
* **🗃️ Base de Datos:** Firebase Firestore
* **🔌 API Externa:** ARASAAC (pictogramas)
* **🚀 Hosting:** Render

## 👥 Integrantes

| Apellidos, nombres | Código |
|--------------------|---------|
| Mendoza Quispe Carlos Fabian | U20231C416 |
| Ibarra Cabrera Camila Adriana | U202317287 | 
| Moncada Olivares Elías David | U202315959 | 
| Miranda Cardenas Sofia Gabriel | U20191C439 | 
| Olivera Alvarez Lizbeth Teresita | U201616851 | 
| Huapaya Vargas Daniel José | U202312230 | 
| Abanto Davila Alvaro Jair Moises | U202313540 | 
| Antonio Moran Jose David | U202223356 | 
| Toledo Mamani Wilber Franz | U202320608 | 
| Rojas Sánchez Patricia Lucía del Rosario | U202310474 | 

## 💼 📋 Roles asignados para el proyecto

| Integrante | Rol (según el enunciado) | Tareas |
|-------------|---------------------------|--------|
| Abanto Dávila, Álvaro Jair Moisés | Scrum Master | Introducción y situación de contexto real |
| Antonio Morán, José David | UI/UX Designer | Introducción y situación de contexto real |
| Huapaya Vargas, Daniel José | Data Engineer | Introducción y situación de contexto real |
| Ibarra Cabrera, Camila Adriana | Data Scientist | Adquisición de datos |
| Mendoza Quispe, Carlos Fabián | Developer | Experimentos |
| Miranda Cárdenas, Sofía Gabriel | Data Scientist | Propuesta técnica |
| Moncada Olivares, Elías David | Data Engineer | Propuesta técnica |
| Olivera Álvarez, Lizbeth Teresita | Developer | Propuesta técnica |
| Rojas Sánchez, Patricia Lucía del Rosario | Data Engineer | Ingeniería de características |
| Toledo Mamani, Wilber Franz | QA Tester | Propuesta técnica |
