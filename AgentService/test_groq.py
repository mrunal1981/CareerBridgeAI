import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))
model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

chat = client.chat.completions.create(
    model=model,
    messages=[{"role": "user", "content": "Say hello in one short line."}],
)
print(chat.choices[0].message.content)