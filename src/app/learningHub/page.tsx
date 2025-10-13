/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React from "react";
import { useState, useEffect } from "react";
import Image from "next/image";
import Navbar from "../Components/Navbar";
import { db, storage } from "@/app/Firebase/firebase";
import {
    collection,
    addDoc,
    getDocs,
    Timestamp,
    updateDoc,
    doc,
} from "firebase/firestore";
import { ref, getDownloadURL, uploadBytes, deleteObject } from "firebase/storage";

const GEMINI_API_KEY =
    process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
    "AIzaSyAp4lX7CpzQoypAsXvhri9_ck16iBth8GA";

async function fetchGemini(prompt: string): Promise<string> {
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 4096,
                    },
                }),
            }
        );
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(
                `API Error: ${response.status} - ${
                    errorData.error?.message || "Unknown error"
                }`
            );
        }
        const data = await response.json();
        if (!data.candidates || data.candidates.length === 0) {
            throw new Error("No response generated from Gemini API");
        }
        const content =
            data.candidates[0]?.content?.parts?.[0]?.text;
        if (!content) {
            throw new Error("Empty response from Gemini API");
        }
        return content;
    } catch (error) {
        console.error("Gemini API Error:", error);
        throw error;
    }
}

interface Question {
    id: number;
    question: string;
    options: string[];
    answer: string;
    correctAnswer: string;
}

interface Slide {
    id: number;
    title: string;
    content: string;
}

interface SlideImage {
    slideId: number;
    title: string;
    imageUrl: string;
    fileName: string;
    slideNumber: number;
}

interface PresentationData {
    slides: Slide[];
    slideImages: SlideImage[];
    createdAt: any;
    totalSlides: number;
    storageFolder: string;
}

interface Material {
    id: string;
    title: string;
    description?: string;
    objectives?: string[];
    questions?: Question[];
    slideData?: Slide[];
    presentationData?: PresentationData;
    createdAt?: any;
    isArchived?: boolean;
}

function convertTimestamp(timestamp: any): Date | null {
    try {
        if (!timestamp) return null;
        if (timestamp instanceof Date) return timestamp;
        if (timestamp && typeof timestamp.toDate === "function") {
            return timestamp.toDate();
        }
        if (timestamp && typeof timestamp === "object" && timestamp.seconds) {
            return new Date(
                timestamp.seconds * 1000 +
                    (timestamp.nanoseconds || 0) / 1000000
            );
        }
        if (typeof timestamp === "number") return new Date(timestamp);
        if (typeof timestamp === "string") return new Date(timestamp);
        return null;
    } catch (error) {
        console.error("Error converting timestamp:", error);
        return null;
    }
}

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number = 0.8): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Failed to convert canvas to blob'));
            }
        }, 'image/png', quality);
    });
};

const generateSlideImages = async (
    title: string,
    slides: Slide[],
    description?: string,
    objectives?: string[]
): Promise<Blob[]> => {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');
        
        canvas.width = 1024;
        canvas.height = 576;
        
        const slideBlobs: Blob[] = [];
        
        const wrapText = (context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
            const words = text.split(' ');
            const lines: string[] = [];
            let currentLine = '';
            
            for (const word of words) {
                const testLine = currentLine + (currentLine ? ' ' : '') + word;
                const metrics = context.measureText(testLine);
                if (metrics.width > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            }
            if (currentLine) {
                lines.push(currentLine);
            }
            return lines;
        };
        
        const drawSlide = (slideData: any, isTitle: boolean = false, isObjectives: boolean = false) => {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.fillStyle = '#1e3a8a';
            ctx.fillRect(0, 0, canvas.width, canvas.height * 0.12);
            
            const footerHeight = canvas.height * 0.08;
            const footerY = canvas.height - footerHeight;
            ctx.fillStyle = '#1e3a8a';
            ctx.fillRect(0, footerY, canvas.width * 0.33, footerHeight);
            ctx.fillStyle = '#dc2626';
            ctx.fillRect(canvas.width * 0.33, footerY, canvas.width * 0.34, footerHeight);
            ctx.fillStyle = '#facc15';
            ctx.fillRect(canvas.width * 0.67, footerY, canvas.width * 0.33, footerHeight);
            
            if (isTitle) {
                ctx.fillStyle = '#1e3a8a';
                ctx.font = 'bold 36px Arial';
                ctx.textAlign = 'center';
                const titleLines = wrapText(ctx, slideData.title, canvas.width * 0.9);
                let titleY = canvas.height * 0.35;
                titleLines.forEach((line: string) => {
                    ctx.fillText(line, canvas.width / 2, titleY);
                    titleY += 42;
                });
                
                if (slideData.description) {
                    ctx.fillStyle = '#374151';
                    ctx.font = '20px Arial';
                    const descLines = wrapText(ctx, slideData.description, canvas.width * 0.9);
                    let descY = titleY + 25;
                    descLines.forEach((line: string) => {
                        ctx.fillText(line, canvas.width / 2, descY);
                        descY += 25;
                    });
                }
                
                ctx.fillStyle = '#6b7280';
                ctx.font = 'bold 16px Arial';
                ctx.fillText('Generated by SK FEDERATION MARIKINA', canvas.width / 2, canvas.height * 0.8);
                
            } else if (isObjectives) {
                ctx.fillStyle = '#1e3a8a';
                ctx.font = 'bold 28px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Learning Objectives', canvas.width / 2, canvas.height * 0.25);
                
                ctx.fillStyle = '#374151';
                ctx.font = '18px Arial';
                ctx.textAlign = 'left';
                const objectivesList = slideData.objectives || [];
                let objY = canvas.height * 0.35;
                objectivesList.forEach((obj: string, idx: number) => {
                    const objText = `${idx + 1}. ${obj}`;
                    const objLines = wrapText(ctx, objText, canvas.width * 0.85);
                    objLines.forEach((line: string) => {
                        ctx.fillText(line, canvas.width * 0.08, objY);
                        objY += 24;
                    });
                    objY += 8;
                });
                
            } else {
                ctx.fillStyle = '#1e3a8a';
                ctx.font = 'bold 24px Arial';
                ctx.textAlign = 'left';
                const titleLines = wrapText(ctx, slideData.title, canvas.width * 0.9);
                let titleY = canvas.height * 0.25;
                titleLines.forEach((line: string) => {
                    ctx.fillText(line, canvas.width * 0.05, titleY);
                    titleY += 30;
                });
                
                ctx.fillStyle = '#374151';
                ctx.font = '16px Arial';
                const contentLines = wrapText(ctx, slideData.content, canvas.width * 0.9);
                let contentY = titleY + 20;
                for (const line of contentLines) {
                    if (contentY > canvas.height * 0.85) break;
                    ctx.fillText(line, canvas.width * 0.05, contentY);
                    contentY += 22;
                }
            }
        };
        
        drawSlide({ title, description }, true);
        const titleBlob = await canvasToBlob(canvas);
        slideBlobs.push(titleBlob);
        
        if (objectives && objectives.filter(obj => obj.trim()).length > 0) {
            drawSlide({ objectives: objectives.filter(obj => obj.trim()) }, false, true);
            const objectivesBlob = await canvasToBlob(canvas);
            slideBlobs.push(objectivesBlob);
        }
        
        for (const slide of slides) {
            const cleanContent = slide.content
                .replace(/\*/g, "")
                .replace(/^\s*[-•]\s*/gm, "")
                .trim();
            
            drawSlide({
                title: slide.title,
                content: cleanContent.length > 200 ? cleanContent.substring(0, 200) + "..." : cleanContent
            });
            
            const slideBlob = await canvasToBlob(canvas);
            slideBlobs.push(slideBlob);
        }
        
        return slideBlobs;
        
    } catch (error) {
        console.error("Slide image generation error:", error);
        throw new Error(`Failed to generate slide images: ${error instanceof Error ? error.message : String(error)}`);
    }
};

const uploadSlidesToFirebase = async (
    slideBlobs: Blob[],
    materialId: string,
    title: string,
    slides: Slide[],
    hasObjectives: boolean = false
): Promise<SlideImage[]> => {
    try {
        const slideImages: SlideImage[] = [];
        const timestamp = Date.now();
        const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, "_");
        const storageFolder = `LearningHub/${materialId}/slides`;
        
        for (let i = 0; i < slideBlobs.length; i++) {
            let slideTitle = '';
            let slideId = i;
            
            if (i === 0) {
                slideTitle = 'Title Slide';
                slideId = 0;
            } else if (hasObjectives && i === 1) {
                slideTitle = 'Learning Objectives';
                slideId = 1;
            } else {
                const slideIndex = hasObjectives ? i - 2 : i - 1;
                slideTitle = slides[slideIndex]?.title || `Content Slide ${slideIndex + 1}`;
                slideId = hasObjectives ? i : i;
            }
            
            const fileName = `${cleanTitle}_slide_${String(i + 1).padStart(2, '0')}_${timestamp}.png`;
            const storageRef = ref(storage, `${storageFolder}/${fileName}`);
            
            await uploadBytes(storageRef, slideBlobs[i]);
            const downloadURL = await getDownloadURL(storageRef);
            
            slideImages.push({
                slideId: slideId,
                title: slideTitle,
                imageUrl: downloadURL,
                fileName: fileName,
                slideNumber: i + 1
            });
        }
        
        return slideImages;
        
    } catch (error) {
        console.error("Firebase Storage upload error:", error);
        throw new Error(`Failed to upload slides to Firebase Storage: ${error instanceof Error ? error.message : String(error)}`);
    }
};

const deleteSlidesFromFirebase = async (slideImages: SlideImage[]): Promise<void> => {
    try {
        for (const slideImage of slideImages) {
            try {
                const url = slideImage.imageUrl;
                const baseUrl = 'https://firebasestorage.googleapis.com/v0/b/';
                const urlParts = url.split(baseUrl)[1];
                if (urlParts) {
                    const pathParts = urlParts.split('/o/')[1];
                    if (pathParts) {
                        const filePath = decodeURIComponent(pathParts.split('?')[0]);
                        const storageRef = ref(storage, filePath);
                        await deleteObject(storageRef);
                    }
                }
            } catch (error) {
                console.warn(`Failed to delete slide ${slideImage.fileName}:`, error);
            }
        }
    } catch (error) {
        console.error("Error deleting slides from Firebase Storage:", error);
    }
};

export default function LearningHub() {
    const [materials, setMaterials] = useState<Material[]>([]);
    const [archivedMaterials, setArchivedMaterials] = useState<Material[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [previewModal, setPreviewModal] = useState(false);
    const [viewModal, setViewModal] = useState(false);
    const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [description, setDescription] = useState("");
    const [objectives, setObjectives] = useState<string[]>([""]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>("");
    const [questions, setQuestions] = useState<Question[]>([]);
    const [slideData, setSlideData] = useState<Slide[]>([]);
    const [showArchived, setShowArchived] = useState(false);
    const [archiveLoading, setArchiveLoading] = useState<string | null>(null);
    const [savingWithSlides, setSavingWithSlides] = useState(false);

    useEffect(() => {
        fetchMaterials();
    }, []);

    const fetchMaterials = async () => {
        try {
            const allSnapshot = await getDocs(collection(db, "learning_hub"));
            const activeDocs: Material[] = [];
            const archivedDocs: Material[] = [];
            
            allSnapshot.docs.forEach((doc) => {
                const data = doc.data();
                const material: Material = {
                    id: doc.id,
                    title: data.title || "",
                    description: data.description || "",
                    objectives: data.objectives || [],
                    questions: data.questions || [],
                    slideData: data.slideData || [],
                    presentationData: data.presentationData || null,
                    createdAt: data.createdAt,
                    isArchived: data.isArchived || false,
                };
                
                if (material.isArchived) {
                    archivedDocs.push(material);
                } else {
                    activeDocs.push(material);
                }
            });
            
            setMaterials(activeDocs);
            setArchivedMaterials(archivedDocs);
        } catch (error) {
            console.error("Error fetching materials:", error);
            setError("Failed to load materials");
        }
    };

    const handleArchive = async (material: Material, archive: boolean = true) => {
        setArchiveLoading(material.id);
        try {
            const materialRef = doc(db, "learning_hub", material.id);
            
            if (archive && material.presentationData?.slideImages?.length) {
                await deleteSlidesFromFirebase(material.presentationData.slideImages);
            }
            
            await updateDoc(materialRef, {
                isArchived: archive,
                archivedAt: archive ? Timestamp.now() : null,
                presentationData: archive ? null : material.presentationData,
            });

            if (archive) {
                setMaterials(prev => prev.filter(m => m.id !== material.id));
                setArchivedMaterials(prev => [...prev, { ...material, isArchived: true, presentationData: undefined }]);
            } else {
                setArchivedMaterials(prev => prev.filter(m => m.id !== material.id));
                setMaterials(prev => [...prev, { ...material, isArchived: false, presentationData: undefined }]);
            }

            setError("");
        } catch (error: any) {
            console.error("Error archiving material:", error);
            setError(`Failed to ${archive ? 'archive' : 'unarchive'} material: ${error.message}`);
        } finally {
            setArchiveLoading(null);
        }
    };

    const parseQuestions = (text: string): Question[] => {
        try {
            const cleanedText = text
                .replace(/Here are \d+ multiple-choice questions.*?:/gi, '')
                .replace(/Based on the.*?content:/gi, '')
                .trim();
            
            const questionBlocks = cleanedText
                .split(/(?=\d+[\.\)]\s*)/g)
                .filter((block) => block.trim().length > 0);
            
            const parsedQuestions = questionBlocks.slice(0, 10).map((block, idx) => {
                const lines = block.trim()
                    .split("\n")
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0);

                const question = lines[0]?.replace(/^(\d+[\.|\)])\s*/, "") || `Question ${idx + 1}`;

                const rawOptions = lines.filter((line) => /^[A-D][\.|\)]\s*/.test(line));
                const cleanedOptions = rawOptions.slice(0, 4).map((opt) => opt.replace(/^[A-D][\.|\)]\s*/, "").trim());

                let answer = "";
                let correctAnswer = "";
                
                const answerLine = lines.find((line) => /Answer\s*:/i.test(line));
                if (answerLine) {
                    const answerText = answerLine.replace(/Answer\s*:/i, '').trim();
                    const letterMatch = answerText.match(/^([A-D])[\.|\)]\s*/i);
                    
                    if (letterMatch) {
                        answer = letterMatch[1].toUpperCase();
                        correctAnswer = answerText.replace(/^[A-D][\.|\)]\s*/i, '').trim();
                    } else {
                        correctAnswer = answerText;
                        const foundIndex = cleanedOptions.findIndex(opt => 
                            opt.toLowerCase().includes(answerText.toLowerCase()) ||
                            answerText.toLowerCase().includes(opt.toLowerCase())
                        );
                        if (foundIndex !== -1) {
                            answer = ['A', 'B', 'C', 'D'][foundIndex];
                        }
                    }
                }

                if (cleanedOptions.length < 4) {
                    return null;
                }

                return {
                    id: idx + 1,
                    question,
                    options: cleanedOptions,
                    answer,
                    correctAnswer
                };
            }).filter((q): q is Question => q !== null);
            
            return parsedQuestions;
        } catch (error) {
            console.error("Error parsing questions:", error);
            return [];
        }
    };

    const parseSlides = (text: string): Slide[] => {
        try {
            const slideBlocks = text
                .split(/(?=slide\s*\d+)/i)
                .filter((block) => block.trim().length > 0);
            return slideBlocks.slice(0, 10).map((block, idx) => {
                const lines = block
                    .trim()
                    .split("\n")
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0);
                const title =
                    lines[0]?.replace(/^slide\s*\d+\s*:?\s*/i, "") ||
                    `Slide ${idx + 1}`;
                let content = lines.slice(1).join("\n")
                    .replace(/^[-•*]\s*/gm, "")
                    .replace(/\*/g, "")
                    .trim();
                if (content.includes("This slide covers important concepts related to the topic")) {
                    content = content.replace("This slide covers important concepts related to the topic.", "").trim();
                }
                if (!content || content.length === 0) {
                    content = `Key concepts and information about ${title.toLowerCase()}.`;
                }
                if (content.length > 200) {
                    content = content.substring(0, 200) + "...";
                }
                return {
                    id: idx + 1,
                    title,
                    content,
                };
            });
        } catch (error) {
            console.error("Error parsing slides:", error);
            return [];
        }
    };

    const handleGenerate = async () => {
        if (!title || !content) {
            setError("Please fill in all fields.");
            return;
        }
        const wordCount = content.trim().split(/\s+/).length;
        if (wordCount > 500) {
            setError("Content must be 500 words or less");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const qPrompt = `Create exactly 10 (ten) multiple-choice questions based on the following content. 

IMPORTANT FORMATTING RULES:
- Do NOT include any introductory text like "Here are 10 questions..." or "Based on the content..."
- Start directly with question 1 and end with question 10
- Format each question EXACTLY as shown below with no extra text

Format for each question:
1. [Question text]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
Answer: [Write the ANSWER FROM GENRATED OPTIONS]

Requirements:
- Distribute correct answers across A, B, C, and D (don't make all answers the same letter)
- Make options challenging and plausible
- Test understanding of key concepts
- Cover different aspects of the content
- For the Answer field, write the COMPLETE answer text as a full statement, DO NOT just write A, B, C, or D

Content: ${content}`;

            const pptPrompt = `Convert the following content into exactly 10 presentation slides with concise, focused content (maximum 2-3 sentences per slide). Format each slide as follows:

Slide 1: [Descriptive Title]
[3-4 sentences explaining this key concept clearly and concisely. Focus on the most important information only. DO NOT use asterisks or any special formatting characters.]

Content: ${content}

Requirements:
- Each slide should focus on one key concept
- Keep explanations very brief and to the point (maximum 4-5 sentences)
- No generic placeholder text
- Make each slide informative but concise
- Avoid lengthy explanations
- DO NOT use asterisks (*) or any special formatting characters
- Use plain text only`;

            const qText = await fetchGemini(qPrompt);
            const pptText = await fetchGemini(pptPrompt);
            const parsedQuestions = parseQuestions(qText);

            // Ensure the number of questions is between 10 and 12
            if (parsedQuestions.length > 10) {
                parsedQuestions.splice(10);
            } else if (parsedQuestions.length < 10) {
                const fallbackOptions = parsedQuestions.length > 0 ? [...parsedQuestions[0].options] : ["Option A", "Option B", "Option C", "Option D"];
                while (parsedQuestions.length < 10) {
                    parsedQuestions.push({
                        id: parsedQuestions.length + 1,
                        question: ` What is the main idea of "${title}"?`,
                        options: fallbackOptions,
                        answer: fallbackOptions[0],
                        correctAnswer: fallbackOptions[0]
                    });
                }
            }
            const parsedSlides = parseSlides(pptText);
            setQuestions(parsedQuestions);
            setSlideData(parsedSlides);
            setShowModal(false);
            setPreviewModal(true);
        } catch (err: any) {
            console.error("Generation error:", err);
            setError(`Failed to generate content: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleViewMaterial = (material: Material) => {
        setSelectedMaterial(material);
        setViewModal(true);
    };

    const handleFinalSave = async () => {
        setSavingWithSlides(true);
        setError("");
        
        try {
            const docRef = await addDoc(collection(db, "learning_hub"), {
                title,
                description,
                objectives: objectives.filter((obj) => obj.trim() !== ""),
                questions,
                slideData,
                isArchived: false,
                createdAt: Timestamp.now(),
            });

            const materialId = docRef.id;
            
            const slideBlobs = await generateSlideImages(
                title,
                slideData,
                description,
                objectives
            );
            
            const slideImages = await uploadSlidesToFirebase(
                slideBlobs,
                materialId,
                title,
                slideData,
                objectives && objectives.length > 0
            );
            
            const presentationData: PresentationData = {
                slides: slideData,
                slideImages: slideImages,
                createdAt: Timestamp.now(),
                totalSlides: slideImages.length,
                storageFolder: `LearningHub/${materialId}/slides`
            };
            
            await updateDoc(docRef, {
                presentationData: presentationData,
            });
            
            setMaterials((prev) => [
                ...prev,
                {
                    id: materialId,
                    title,
                    description,
                    objectives: objectives.filter((obj) => obj.trim() !== ""),
                    questions,
                    slideData,
                    presentationData,
                    isArchived: false,
                    createdAt: Timestamp.now(),
                },
            ]);
            
            setPreviewModal(false);
            setTitle("");
            setContent("");
            setDescription("");
            setObjectives([""]);
            setQuestions([]);
            setSlideData([]);
            
        } catch (err: any) {
            console.error("Error saving with slides:", err);
            setError(`Failed to save with slides: ${err.message}`);
        } finally {
            setSavingWithSlides(false);
        }
    };

    const updateQuestion = (index: number, field: keyof Question, value: any) => {
        setQuestions((prev) => {
            const updated = [...prev];
            if (updated[index]) {
                updated[index] = { ...updated[index], [field]: value };
            }
            return updated;
        });
    };

    const updateSlide = (index: number, field: keyof Slide, value: any) => {
        setSlideData((prev) => {
            const updated = [...prev];
            if (updated[index]) {
                updated[index] = { ...updated[index], [field]: value };
            }
            return updated;
        });
    };

    const updateQuestionOption = (questionIndex: number, optionIndex: number, value: string) => {
        setQuestions((prev) => {
            const updated = [...prev];
            if (updated[questionIndex] && updated[questionIndex].options[optionIndex] !== undefined) {
                updated[questionIndex].options[optionIndex] = value;
            }
            return updated;
        });
    };

    const addObjective = () => {
        setObjectives((prev) => [...prev, ""]);
    };

    const removeObjective = (index: number) => {
        setObjectives((prev) => prev.filter((_, i) => i !== index));
    };

    const updateObjective = (index: number, value: string) => {
        setObjectives((prev) => {
            const updated = [...prev];
            updated[index] = value;
            return updated;
        });
    };

    return (
        <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
            {error ? (
                <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                    {error}
                    <button
                        onClick={() => setError("")}
                        className="ml-2 text-red-900 hover:text-red-700"
                    >
                        ×
                    </button>
                </div>
            ) : null}
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-semibold text-gray-800">Learning Hub</h1>
                    <p className="text-lg text-gray-600 mt-1">
                        Explore and create learning materials with automatically generated PNG presentation slides.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setShowArchived(!showArchived)}
                        className="bg-gray-500 text-white px-6 py-2 rounded-lg shadow-md hover:opacity-90 transition-opacity"
                    >
                        {showArchived ? "Show Active" : "Show Archived"}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowModal(true)}
                        className="bg-[#1167B1] text-white px-6 py-2 rounded-lg shadow-md hover:opacity-90 transition-opacity"
                    >
                        Create Learning Material
                    </button>
                </div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-md">
                {(showArchived ? archivedMaterials : materials).length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <p>{showArchived ? "No archived materials." : "No learning materials yet. Create your first one!"}</p>
                    </div>
                ) : null}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {(showArchived ? archivedMaterials : materials).map((m) => {
                        return (
                        <div
                            key={m.id}
                            className="bg-blue-100 p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                            onClick={() => handleViewMaterial(m)}
                        >
                            <h2 className="font-bold text-lg text-gray-800 mb-2">{m.title}</h2>
                            {m.description && (
                                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{m.description}</p>
                            )}
                            <div className="text-sm text-gray-600">
                                <p>Questions: {m.questions?.length || 0}</p>
                                <p>Content Slides: {m.slideData?.length || 0}</p>
                                <p>Objectives: {m.objectives?.length || 0}</p>
                                {m.presentationData && m.presentationData.slideImages.length > 0 && (
                                    <p>PNG Images: {m.presentationData.slideImages.length} slides</p>
                                )}
                            </div>
                            <div className="mt-4">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleArchive(m, !showArchived);
                                    }}
                                    disabled={archiveLoading === m.id}
                                    className={`w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                                        showArchived 
                                            ? "bg-green-500 text-white hover:bg-green-600" 
                                            : "bg-red-500 text-white hover:bg-red-600"
                                    } disabled:opacity-50`}
                                >
                                    {archiveLoading === m.id 
                                        ? (showArchived ? "Unarchiving..." : "Archiving...") 
                                        : (showArchived ? "Unarchive" : "Archive")
                                    }
                                </button>
                            </div>
                        </div>
                        );
                    })}
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 flex items-center justify-center bg-opacity-40 backdrop-blur z-50">
                    <div className="bg-white p-6 rounded-xl shadow-lg w-[600px] max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4">Create Learning Material</h2>
                        <input
                            type="text"
                            placeholder="Enter module title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full border rounded-lg p-2 mb-3 focus:border-[#1167B1] outline-none"
                        />
                        <textarea
                            placeholder="Enter module description (optional)"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full border rounded-lg p-2 mb-3 h-20 resize-none focus:border-[#1167B1] outline-none"
                        />
                        <div className="mb-3">
                            <label className="block text-sm font-medium mb-2">Learning Objectives</label>
                            {objectives.map((objective, index) => (
                                <div key={index} className="flex gap-2 mb-2">
                                    <input
                                        type="text"
                                        placeholder={`Learning objective ${index + 1}`}
                                        value={objective}
                                        onChange={(e) => updateObjective(index, e.target.value)}
                                        className="flex-1 border rounded-lg p-2 focus:border-[#1167B1] outline-none"
                                    />
                                    {objectives.length > 1 && (
                                        <button
                                            onClick={() => removeObjective(index)}
                                            className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button
                                onClick={addObjective}
                                className="text-sm text-[#1167B1] hover:text-blue-700 transition-colors"
                            >
                                + Add another objective
                            </button>
                        </div>
                        <textarea
                            placeholder="Enter content (max 500 words) - This will be used to generate questions and slides"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="w-full border rounded-lg p-2 mb-3 h-40 resize-none focus:border-[#1167B1] outline-none"
                        />
                        <div className="text-sm text-gray-500 mb-4">
                            Word count:{" "}
                            {
                                content
                                    .trim()
                                    .split(/\s+/)
                                    .filter((word) => word.length > 0).length
                            }
                            /500
                        </div>
                        <div className="text-sm text-blue-600 mb-4">
                            Content is only used for generation and won't be stored in the database.
                        </div>
                        <div className="flex justify-end space-x-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowModal(false);
                                    setError("");
                                }}
                                className="px-4 py-2 rounded-lg border hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleGenerate}
                                disabled={loading || !title || !content}
                                className="bg-[#1167B1] text-white px-4 py-2 rounded-lg shadow-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                            >
                                {loading ? "Generating..." : "Generate"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {previewModal && (
                <div className="fixed inset-0 flex items-center justify-center bg-opacity-40 backdrop-blur z-50">
                    <div className="bg-white p-6 rounded-xl shadow-lg w-[800px] max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4">Preview Generated Content</h2>
                        
                        <div className="mb-6">
                            <h3 className="text-lg font-semibold mb-2">Questions ({questions.length})</h3>
                            <div className="max-h-60 overflow-y-auto space-y-3">
                                {questions.map((q, idx) => (
                                    <div key={idx} className="p-3 border rounded-lg">
                                        <div className="font-medium mb-2">
                                            <input
                                                type="text"
                                                value={q.question}
                                                onChange={(e) => updateQuestion(idx, 'question', e.target.value)}
                                                className="w-full border rounded p-1 text-sm"
                                            />
                                        </div>
                                        {q.options.map((opt, optIdx) => (
                                            <div key={optIdx} className="text-sm mb-1">
                                                <input
                                                    type="text"
                                                    value={opt}
                                                    onChange={(e) => updateQuestionOption(idx, optIdx, e.target.value)}
                                                    className="w-full border rounded p-1"
                                                />
                                            </div>
                                        ))}
                                        <div className="text-sm font-medium text-green-600 mt-2">
                                            <label className="block mb-1">Correct Answer:</label>
                                            <input
                                                type="text"
                                                value={q.correctAnswer}
                                                onChange={(e) => updateQuestion(idx, 'correctAnswer', e.target.value)}
                                                className="w-full border rounded p-1"
                                                placeholder="Enter the correct answer text"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mb-6">
                            <h3 className="text-lg font-semibold mb-2">Slides ({slideData.length})</h3>
                            <div className="max-h-60 overflow-y-auto space-y-3">
                                {slideData.map((slide, idx) => (
                                    <div key={idx} className="p-3 border rounded-lg">
                                        <input
                                            type="text"
                                            value={slide.title}
                                            onChange={(e) => updateSlide(idx, 'title', e.target.value)}
                                            className="w-full border rounded p-1 font-medium mb-2"
                                        />
                                        <textarea
                                            value={slide.content}
                                            onChange={(e) => updateSlide(idx, 'content', e.target.value)}
                                            className="w-full border rounded p-1 text-sm h-20 resize-none"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="text-sm text-blue-600 mb-4">
                            PNG slide images will be automatically generated and saved when you save this material.
                        </div>

                        <div className="flex justify-end space-x-2">
                            <button
                                onClick={() => {
                                    setPreviewModal(false);
                                    setShowModal(true);
                                }}
                                className="px-4 py-2 rounded-lg border hover:bg-gray-50 transition-colors"
                                disabled={savingWithSlides}
                            >
                                Back to Edit
                            </button>
                            <button
                                onClick={handleFinalSave}
                                disabled={savingWithSlides}
                                className="bg-[#1167B1] text-white px-4 py-2 rounded-lg shadow-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                            >
                                {savingWithSlides ? "Saving & Generating Slides..." : "Save Material & Generate Slides"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {viewModal && selectedMaterial && (
                <div className="fixed inset-0 flex items-center justify-center bg-opacity-40 backdrop-blur z-50">
                    <div className="bg-white p-6 rounded-xl shadow-lg w-[800px] max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">{selectedMaterial.title}</h2>
                            <button
                                onClick={() => setViewModal(false)}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                ×
                            </button>
                        </div>
                        
                        {selectedMaterial.description && (
                            <div className="mb-4">
                                <h3 className="font-semibold mb-2">Description</h3>
                                <p className="text-gray-700">{selectedMaterial.description}</p>
                            </div>
                        )}

                        {selectedMaterial.objectives && selectedMaterial.objectives.length > 0 && (
                            <div className="mb-4">
                                <h3 className="font-semibold mb-2">Learning Objectives</h3>
                                <ul className="list-disc list-inside text-gray-700">
                                    {selectedMaterial.objectives.map((obj, idx) => (
                                        <li key={idx}>{obj}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {selectedMaterial.presentationData && selectedMaterial.presentationData.slideImages.length > 0 && (
                            <div className="mb-4">
                                <h3 className="font-semibold mb-2">Generated Slide Images ({selectedMaterial.presentationData.slideImages.length})</h3>
                                <div className="grid grid-cols-2 gap-4 max-h-60 overflow-y-auto">
                                    {selectedMaterial.presentationData.slideImages.map((slideImg, idx) => (
                                        <div key={idx}>
                                            <Image 
                                                src={slideImg.imageUrl} 
                                                alt={slideImg.title}
                                                width={400}
                                                height={80}
                                                className="w-full h-20 object-cover rounded mb-2"
                                            />
                                            <p className="text-xs font-medium">{slideImg.title}</p>
                                            <a 
                                                href={slideImg.imageUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-xs text-blue-600 hover:underline"
                                            >
                                                Download PNG
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mb-4">
                            <h3 className="font-semibold mb-2">Questions ({selectedMaterial.questions?.length || 0})</h3>
                            <div className="max-h-40 overflow-y-auto space-y-2">
                                {selectedMaterial.questions?.map((q, idx) => (
                                    <div key={idx} className="text-sm p-2 bg-gray-50 rounded">
                                        <div className="font-medium mb-1">{q.question}</div>
                                        {q.options.map((opt, optIdx) => (
                                            <div key={optIdx} className={opt === q.correctAnswer ? "text-green-600 font-medium" : ""}>
                                                {String.fromCharCode(65 + optIdx)}) {opt}
                                            </div>
                                        ))}
                                        <div className="mt-1 text-green-600 font-medium">
                                            Correct Answer: {q.correctAnswer}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="text-sm text-gray-500">
                            Created: {selectedMaterial.createdAt && convertTimestamp(selectedMaterial.createdAt)?.toLocaleDateString()}
                        </div>
                    </div>
                </div>
            )}

            <Navbar />
        </div>
    );
}