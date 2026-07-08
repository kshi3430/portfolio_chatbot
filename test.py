from langchain.chat_models import init_chat_model
import os
from dotenv import load_dotenv
load_dotenv()

gemini_model = init_chat_model('google_genai:gemini-2.5-flash-lite')

response = gemini_model.invoke('안녕. 한국어로 답변해줘')

print(response.content)