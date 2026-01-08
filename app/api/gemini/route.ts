
import { NextResponse } from "next/server";
// Always use the correct import for GoogleGenAI
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    // Initialize using a named parameter and the mandatory process.env.API_KEY
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Call generateContent directly using ai.models.generateContent as per guidelines
    // Using gemini-3-flash-preview for general text tasks
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    // Access the text property directly (not as a method)
    const text = response.text;

    return NextResponse.json({ text });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
