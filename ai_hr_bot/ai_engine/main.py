from fastapi import FastAPI, UploadFile, File
import pdfplumber
import subprocess
import json

app = FastAPI()

def ask_ai(prompt):
    result = subprocess.run(
        ["ollama", "run", "mistral"],
        input=prompt.encode(),
        stdout=subprocess.PIPE
    )
    return result.stdout.decode()


@app.post("/parse_resume")
async def parse_resume(file: UploadFile = File(...)):
    text = ""

    with pdfplumber.open(file.file) as pdf:
        for page in pdf.pages:
            if page.extract_text():
                text += page.extract_text() + "\n"

    if not text.strip():
        return {"error": "No readable text found in resume"}

    prompt = f"""
    Extract candidate profile in JSON:
    name, skills (array), experience, projects (array)

    Resume:
    {text}
    """

    response = ask_ai(prompt)

    try:
        return json.loads(response)
    except:
        return {"raw": response}


@app.post("/generate_questions")
async def generate_questions(profile: dict):

    prompt = f"""
    You are HR interviewer.
    Generate 10 interview questions based on profile.

    Profile:
    {json.dumps(profile)}
    """

    return {"questions": ask_ai(prompt)}