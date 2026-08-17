@app.post("/generate-questions")
async def generate_questions(profile: dict):

    prompt = f"""
Generate 10 interview questions based on this resume:
{json.dumps(profile)}

Return ONLY JSON array:
[
  {{"question":"","category":"","difficulty":""}}
]
"""

    res = openai.ChatCompletion.create(
        model="gpt-4o-mini",
        messages=[{"role":"user","content":prompt}],
        temperature=0.3
    )

    return json.loads(res.choices[0].message.content)


@app.post("/evaluate-answer")
async def evaluate_answer(data: dict):

    prompt = f"""
Evaluate this interview answer.

Question: {data['question']}
Answer: {data['answer']}

Return JSON only:
{{"technical":0,"feedback":""}}
"""

    res = openai.ChatCompletion.create(
        model="gpt-4o-mini",
        messages=[{"role":"user","content":prompt}],
        temperature=0.2
    )

    return json.loads(res.choices[0].message.content)