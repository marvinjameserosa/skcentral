/* eslint-disable @typescript-eslint/no-unused-vars */
 
"use client";
import { useState, ChangeEvent } from "react";
import Link from "next/link";
import Navbar from "../../Components/Navbar";
import jsPDF from "jspdf";
import router from "next/router";

// Firebase dependencies
import { app } from "@/app/Firebase/firebase";
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Initialize Firebase Storage
const storage = getStorage(app);

interface Entry {
  id: string;
  title: string;
  location: string;
  reason: string;
  goal: string;
  participants: string;
  activityDetails: string;
  plan: string;
  activityType: string;
  budget: string;
  startDate: string; // Changed from targetDate
  endDate: string;   // Added end date
}

const ProjectDesignBrief = () => {
  // 👇 Replace with your actual Gemini API Key
  const GEMINI_API_KEY = "AIzaSyDcc88amIouRWmXenD-N9iUl5w_V5ZJWBk";

  const [formData, setFormData] = useState({
    title: "",
    location: "",
    reason: "",
    goal: "",
    participants: "",
    activityDetails: "",
    plan: "",
    activityType: "",
    budget: "",
    startDate: "", // Changed from targetDate
    endDate: "",   // Added end date
  });

  const [alertMessage, setAlertMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadingToFirebase, setUploadingToFirebase] = useState({
    design: false,
    brief: false
  });
  const [generatedPDFs, setGeneratedPDFs] = useState<{
    design: string | null;
    brief: string | null;
  }>({
    design: null,
    brief: null
  });

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  // Helper function to read file as data URL
  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Helper function to convert data URL to Blob
  const dataURLToBlob = (dataURL: string): Blob => {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
  };

  // Upload PDF to Firebase with compression and proper path
  const uploadToFirebase = async (pdfBlob: Blob, type: 'brief' | 'design'): Promise<string> => {
    try {
      setUploadingToFirebase(prev => ({ ...prev, [type]: true }));
      
      // Compress blob if it's too large
      const finalBlob = pdfBlob;
      if (pdfBlob.size > 5 * 1024 * 1024) { // If larger than 5MB
        console.log(`Compressing ${type} PDF (original size: ${(pdfBlob.size / 1024 / 1024).toFixed(2)}MB)`);
        // Note: For actual compression, you'd need a PDF compression library
        // For now, we'll just use the original blob
      }
      
      const timestamp = Date.now();
      const filename = `reports/${type === 'brief' ? 'project-brief' : 'project-design'}-${timestamp}.pdf`;
      const storageRef = ref(storage, filename);

      console.log(`Uploading ${type} to Firebase Storage at: ${filename}`);
      await uploadBytes(storageRef, finalBlob);
      const downloadURL = await getDownloadURL(storageRef);

      // Store Firebase URL in localStorage
      localStorage.setItem(
        type === 'brief' ? 'projectBriefFirebaseUrl' : 'projectDesignFirebaseUrl', 
        downloadURL
      );

      console.log(`✅ ${type} PDF uploaded to Firebase:`, downloadURL);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading to Firebase:', error);
      throw new Error(`Failed to upload ${type} to cloud storage: ${error}`);
    } finally {
      setUploadingToFirebase(prev => ({ ...prev, [type]: false }));
    }
  };

  // Helper function to check page break
  const checkPageBreak = (doc: jsPDF, yPos: number, pageHeight: number, margin: number): number => {
    if (yPos > pageHeight - margin - 100) {
      doc.addPage();
      return margin + 50; // Start position for new page
    }
    return yPos;
  };

  // Helper function to clean text by removing asterisks and other markdown formatting
  const cleanText = (text: string): string => {
    return text
      .replace(/\*{1,3}/g, '') // Remove all asterisks (*, **, ***)
      .replace(/_{1,3}/g, '') // Remove underscores (_, __, ___)
      .replace(/#{1,6}\s?/g, '') // Remove markdown headers (# ## ###)
      .replace(/`{1,3}/g, '') // Remove code formatting (``)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links [text](url) to just text
      .replace(/^\s*[-*+]\s+/gm, '') // Remove bullet points
      .replace(/^\s*\d+\.\s+/gm, '') // Remove numbered lists
      .trim();
  };

  // Enhanced function to call Gemini API with retry logic and better error handling
  const generateWithGemini = async (prompt: string, maxRetries: number = 3) => {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Calling Gemini API... (Attempt ${attempt}/${maxRetries})`);
        
        // Add exponential backoff delay for retries
        if (attempt > 1) {
          const delay = Math.pow(2, attempt - 1) * 1000; // 2s, 4s, 8s...
          console.log(`Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const requestBody = {
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH", 
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
          ]
        };

        console.log("Request body:", JSON.stringify(requestBody, null, 2));

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }
        );

        console.log("Response status:", response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("API Error Response:", errorText);
          
          let errorMessage = "Failed to generate content";
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error?.message || errorMessage;
            
            // Check for specific error types that should be retried
            if (errorMessage.toLowerCase().includes('overloaded') || 
                errorMessage.toLowerCase().includes('quota') ||
                errorMessage.toLowerCase().includes('rate limit') ||
                response.status === 429 ||
                response.status === 503) {
              
              console.log(`Retryable error detected: ${errorMessage}`);
              lastError = new Error(errorMessage);
              continue; // Try again
            }
          } catch (e) {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
          
          throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log("API Response:", data);

        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
          throw new Error("Invalid response format from API");
        }

        const generatedText = data.candidates[0].content.parts[0].text as string;
        
        // Clean the generated text to remove asterisks and other markdown formatting
        console.log(`✅ Successfully generated content on attempt ${attempt}`);
        return cleanText(generatedText);
        
      } catch (error) {
        console.error(`Error on attempt ${attempt}:`, error);
        lastError = error as Error;
        
        // If it's not a retryable error, throw immediately
        if (!(error as Error).message.toLowerCase().includes('overloaded') &&
            !(error as Error).message.toLowerCase().includes('quota') &&
            !(error as Error).message.toLowerCase().includes('rate limit')) {
          throw error;
        }
        
        // If this was the last attempt, throw the error
        if (attempt === maxRetries) {
          break;
        }
      }
    }
    
    // If we get here, all retries failed
    throw new Error(`Failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
  };

  // Generate Project Design content with better formatting
  const generateProjectDesign = async () => {
    const dateRange = formData.startDate === formData.endDate 
      ? formData.startDate 
      : `${formData.startDate} to ${formData.endDate}`;
    
    const prompt = `
Create a comprehensive Project Design document with clear formatting and proper alignment:

User Input:
- Title: ${formData.title}
- Location: ${formData.location}
- Reason: ${formData.reason}
- Goal: ${formData.goal}
- Participants: ${formData.participants}
- Activity Details: ${formData.activityDetails}
- Plan: ${formData.plan}
- Activity Type: ${formData.activityType}
- Budget: ${formData.budget}
- Implementation Date: ${dateRange}

Structure the response with these exact section headings (all caps with colon):

PROJECT TITLE:
${formData.title}

RATIONALE / BACKGROUND:
Write a comprehensive 3-4 sentence background explaining why this project is needed. Base this on the reason provided and expand on community needs, current situation, and importance.

OBJECTIVES:
Create 3-5 clear, specific, and measurable objectives based on the goal provided. Format as:
1. [Specific objective 1]
2. [Specific objective 2]
3. [Specific objective 3]

PARTICIPANTS:
Target Participants: ${formData.participants}
Expected Number: [Estimate based on participant type]
Selection Criteria: [Based on participant description]

VENUE / LOCATION:
${formData.location}

ACTIVITY DESCRIPTION / FLOW OF EVENTS:
Create a detailed timeline and flow based on the activity details. Format as:
Phase 1: [Activity phase]
Phase 2: [Activity phase]
Phase 3: [Activity phase]

METHODOLOGY / STRATEGIES:
Based on the plan provided, detail the specific methods and strategies to be used. Write 2-3 paragraphs explaining the approach.

TYPE OF ACTIVITY:
${formData.activityType}

BUDGET:
${formData.budget}

TARGET DATE OF IMPLEMENTATION:
${dateRange}

EXPECTED OUTCOMES:
List 3-4 specific expected outcomes and benefits. Format as:
- [Expected outcome 1]
- [Expected outcome 2]
- [Expected outcome 3]

Use professional language, clear paragraph breaks, and ensure proper spacing between sections. Do not use asterisks, bold formatting, or markdown symbols.
    `;

    return await generateWithGemini(prompt);
  };

  // Generate Project Brief content - Updated to return table format
  const generateProjectBrief = async () => {
    const dateRange = formData.startDate === formData.endDate 
      ? formData.startDate 
      : `${formData.startDate} to ${formData.endDate}`;
    
    const prompt = `
Based on the following information, create a Project Brief document in table format:

User Input:
- Title: ${formData.title}
- Location: ${formData.location}
- Reason: ${formData.reason}
- Goal: ${formData.goal}
- Participants: ${formData.participants}
- Activity Details: ${formData.activityDetails}
- Plan: ${formData.plan}
- Activity Type: ${formData.activityType}
- Budget: ${formData.budget}
- Implementation Date: ${dateRange}

Please structure the response as a table with the following format:

PROJECT TITLE | ${formData.title}
LOCATION OF THE PROJECT | ${formData.location}
PROPOSED IMPLEMENTING AGENCY | Office of the Sangguninang Kabataan Federation
OBJECTIVE/S | [Based on the goal and reason provided]
TARGET PHYSICAL OUTPUT | [Based on activity details and expected deliverables]
TARGET BENEFICIARIES | ${formData.participants}
BUDGET | ${formData.budget}
TARGET DATE OF IMPLEMENTATION | ${dateRange}

Keep it concise but informative. Each row should be clear and to the point. Write in a formal, professional tone suitable for official documentation. DO NOT use asterisks, bold formatting, or any markdown symbols in your response. Use plain text only. Format as a simple table with pipe separators.
    `;

    return await generateWithGemini(prompt);
  };

  // Enhanced PDF generation function with table support for brief
  const generatePDF = async (content: string, filename: string, type: 'design' | 'brief'): Promise<Blob> => {
    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;

      // Add official header with logos
      let yPos = 60;
      
      // Try to add logos (from /public directory)
      try {
        const skLogoResponse = await fetch("/SKLogo.png");
        const skLogoBlob = await skLogoResponse.blob();
        const skLogoDataUrl = await readFileAsDataURL(skLogoBlob as File);
        // Reduce logo size and use compression
        doc.addImage(skLogoDataUrl, "PNG", margin, 38, 60, 48, undefined, 'FAST');

        const marikinaLogoResponse = await fetch("/MarikinaLogo.png");
        const marikinaLogoBlob = await marikinaLogoResponse.blob();
        const marikinaLogoDataUrl = await readFileAsDataURL(marikinaLogoBlob as File);
        doc.addImage(marikinaLogoDataUrl, "PNG", pageWidth - margin - 60, 38, 60, 60, undefined, 'FAST');
      } catch (err) {
        console.warn("Logo images failed to load", err);
      }

      // Official header text
      doc.setFont("times", "italic");
      doc.setFontSize(23);
      doc.text("Republic of the Philippines", pageWidth / 2, yPos, { align: "center" });

      yPos += 23;
      doc.setFont("times", "normal");
      doc.setFontSize(14);
      doc.text("National Capital Region, Metropolitan Manila", pageWidth / 2, yPos, { align: "center" });

      yPos += 14;
      doc.text("City of Marikina", pageWidth / 2, yPos, { align: "center" });

      yPos += 11;
      doc.setFontSize(11);
      doc.text("3rd Floor, Marikina New Legislative Building", pageWidth / 2, yPos, { align: "center" });

      yPos += 11;
      doc.text("Email Address: skfederationmarikinacity@gmail.com", pageWidth / 2, yPos, { align: "center" });

      yPos += 34;
      doc.setFontSize(14);
      doc.setFont("times", "bold");
      doc.text("OFFICE OF THE SANGGUNINANG KABATAAN FEDERATION", pageWidth / 2, yPos, { align: "center" });

      yPos += 40;

      // Document title
      doc.setFont("times", "bold");
      doc.setFontSize(17);
      const documentTitle = type === 'design' ? 'PROJECT DESIGN' : 'PROJECT BRIEF';
      doc.text(documentTitle, pageWidth / 2, yPos, { align: "center" });
      yPos += 40;

      // Clean the content one more time before processing
      const cleanedContent = cleanText(content);
      
      if (type === 'brief' && cleanedContent.includes('|')) {
        // Handle table format for project brief
        const lines = cleanedContent.split("\n");
        const lineHeight = 25;
        const cellPadding = 8;
        
        lines.forEach((line) => {
          yPos = checkPageBreak(doc, yPos, pageHeight, margin);
          
          if (line.includes('|')) {
            const parts = line.split('|').map(part => part.trim());
            if (parts.length >= 2) {
              const labelWidth = 200;
              const contentWidth = pageWidth - 2 * margin - labelWidth;
              
              // Draw table row
              doc.setFillColor(240, 240, 240);
              doc.rect(margin, yPos - 15, labelWidth, lineHeight, 'F');
              doc.rect(margin + labelWidth, yPos - 15, contentWidth, lineHeight);
              
              // Add text
              doc.setFont("times", "bold");
              doc.setFontSize(10);
              doc.text(parts[0], margin + cellPadding, yPos, { maxWidth: labelWidth - 2 * cellPadding });
              
              doc.setFont("times", "normal");
              const contentText = parts[1] || '';
              const splitContent = doc.splitTextToSize(contentText, contentWidth - 2 * cellPadding);
              doc.text(splitContent, margin + labelWidth + cellPadding, yPos);
              
              yPos += Math.max(lineHeight, splitContent.length * 12);
            }
          } else if (line.trim().length > 0) {
            // Handle non-table content
            doc.setFont("times", "normal");
            doc.setFontSize(11);
            const maxWidth = pageWidth - 2 * margin;
            const splitLines = doc.splitTextToSize(line.trim(), maxWidth);
            
            splitLines.forEach((splitLine: string) => {
              yPos = checkPageBreak(doc, yPos, pageHeight, margin);
              doc.text(splitLine, margin, yPos);
              yPos += 12;
            });
          }
        });
      } else {
        // Handle regular format for project design
        const lines = cleanedContent.split("\n");
        const lineHeight = 12;
        
        lines.forEach((line) => {
          yPos = checkPageBreak(doc, yPos, pageHeight, margin);
          
          if (line.trim().endsWith(":") && line.trim() === line.trim().toUpperCase()) {
            // Section headers
            doc.setFont("times", "bold");
            doc.setFontSize(12);
            yPos += 8;
          } else if (line.trim().length === 0) {
            // Empty lines
            yPos += lineHeight / 2;
            return;
          } else {
            // Regular content
            doc.setFont("times", "normal");
            doc.setFontSize(11);
          }

          const maxWidth = pageWidth - 2 * margin;
          const splitLines = doc.splitTextToSize(line.trim(), maxWidth);

          splitLines.forEach((splitLine: string) => {
            yPos = checkPageBreak(doc, yPos, pageHeight, margin);
            doc.text(splitLine, margin, yPos);
            yPos += lineHeight;
          });

          if (line.trim().endsWith(":") && line.trim() === line.trim().toUpperCase()) {
            yPos += 5;
          }
        });
      }

      // Create blob
      const pdfArrayBuffer = doc.output("arraybuffer");
      const pdfBlob = new Blob([pdfArrayBuffer], { type: "application/pdf" });

      // Create URL for local viewing and download
      const pdfUrl = URL.createObjectURL(pdfBlob);
      
      // Store in localStorage
      try {
        const storageKey = type === 'design' ? 'projectDesignPdf' : 'projectBriefPdf';
        localStorage.setItem(storageKey, pdfUrl);
        console.log(`✅ Stored ${type} PDF in localStorage:`, storageKey);
      } catch (storageError) {
        console.error("Error storing PDF in localStorage:", storageError);
      }

      // Update local state
      setGeneratedPDFs(prev => ({
        ...prev,
        [type]: pdfUrl
      }));

      // Download the PDF
      doc.save(filename);

      return pdfBlob;
    } catch (error) {
      console.error("Error generating PDF:", error);
      throw new Error("Failed to generate PDF");
    }
  };

  const handleGenerate = async () => {
    // Validate form data
    const emptyFields = Object.entries(formData)
      .filter(([key, value]) => value.trim() === "")
      .map(([key]) => key);

    if (emptyFields.length > 0) {
      setAlertMessage(`Please fill in all fields. Missing: ${emptyFields.join(", ")}`);
      return;
    }

    // Validate date range
    if (formData.startDate && formData.endDate && formData.startDate > formData.endDate) {
      setAlertMessage("Start date cannot be later than end date.");
      return;
    }

    // Confirm generation
    const isConfirmed = window.confirm(
      "Are you sure you want to generate the Project Design and Project Brief documents? They will be automatically uploaded to cloud storage."
    );
    
    if (!isConfirmed) {
      setAlertMessage("Document generation cancelled.");
      return;
    }

    setIsLoading(true);
    setAlertMessage("");

    try {
      console.log("Starting document generation...");
      
      // Generate both documents
      setAlertMessage("🔄 Generating documents with AI...");
      const [projectDesignContent, projectBriefContent] = await Promise.all([
        generateProjectDesign(),
        generateProjectBrief(),
      ]);

      console.log("Documents generated, creating PDFs...");
      setAlertMessage("🔄 Creating PDF documents...");

      // Generate PDFs and get blobs
      const designBlob = await generatePDF(
        projectDesignContent, 
        `${formData.title || "Project"}_Design.pdf`,
        'design'
      );
      const briefBlob = await generatePDF(
        projectBriefContent, 
        `${formData.title || "Project"}_Brief.pdf`,
        'brief'
      );

      // Upload to Firebase automatically with parallel uploads for speed
      setAlertMessage("🔄 Uploading to cloud storage...");
      const uploadPromises = [
        uploadToFirebase(designBlob, 'design'),
        uploadToFirebase(briefBlob, 'brief')
      ];
      
      const [designUrl, briefUrl] = await Promise.all([
        uploadToFirebase(designBlob, 'design'),
        uploadToFirebase(briefBlob, 'brief')
      ]);

      setAlertMessage(
        "✅ Both Project Design and Project Brief have been generated, downloaded, and uploaded to cloud storage successfully! You can now view them in the PDF viewer page."
      );
      
      console.log("Process completed successfully");
      console.log("Generated PDFs URLs:", { designUrl, briefUrl });
      
    } catch (error) {
      console.error("Error in handleGenerate:", error);
      
      let errorMessage = "❌ Error generating documents. ";
      
      if (error instanceof Error) {
        if (error.message.includes("API key")) {
          errorMessage += "Please check your Gemini API key.";
        } else if (error.message.includes("quota")) {
          errorMessage += "API quota exceeded. Please try again later.";
        } else if (error.message.includes("network") || error.message.includes("fetch")) {
          errorMessage += "Network error. Please check your internet connection.";
        } else if (error.message.includes("cloud storage")) {
          errorMessage += "Failed to upload to cloud storage, but PDFs were generated locally.";
        } else {
          errorMessage += error.message;
        }
      } else {
        errorMessage += "Unknown error occurred.";
      }
      
      setAlertMessage(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    // Reset form data
    setFormData({
      title: "",
      location: "",
      reason: "",
      goal: "",
      participants: "",
      activityDetails: "",
      plan: "",
      activityType: "",
      budget: "",
      startDate: "", // Reset start date
      endDate: "",   // Reset end date
    });
    setAlertMessage("Form has been reset.");
  };

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-800">Transparency Report</h1>
        <p className="text-lg text-gray-600 mt-1">Create reports and activities for internal tracking.</p>
      </div>
      
      <div className="w-full bg-white rounded-xl shadow-md">
        <div className="relative bg-[#1167B1] text-white px-6 py-4 rounded-t-xl">
          <Link href="/transparency-report">
            <button className="absolute left-6 top-1/2 -translate-y-1/2 text-xl hover:opacity-80">←</button>
          </Link>
          <h2 className="text-center text-3xl font-semibold">Project Design and Brief</h2>
        </div>
        <Navbar />

        {/* Alert Message */}
        {alertMessage && (
          <div className="mx-6 mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-800">
            {alertMessage}
          </div>
        )}

        {/* Form Container */}
        <div className="p-8">
          {/* Form Fields - Vertical Layout */}
          <div className="space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">
                What is the title of your activity?
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                className="w-full p-4 bg-gray-100 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Enter project title..."
              />
            </div>

            {/* Activity Details */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">
                What will happen in the activity?
              </label>
              <textarea
                name="activityDetails"
                value={formData.activityDetails}
                onChange={handleInputChange}
                rows={3}
                className="w-full p-4 bg-gray-100 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                placeholder="Describe what will happen..."
              />
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">
                Why are you doing this activity?
              </label>
              <textarea
                name="reason"
                value={formData.reason}
                onChange={handleInputChange}
                rows={3}
                className="w-full p-4 bg-gray-100 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                placeholder="Explain the rationale..."
              />
            </div>

            {/* Plan */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">
                How will you plan and organize this activity?
              </label>
              <textarea
                name="plan"
                value={formData.plan}
                onChange={handleInputChange}
                rows={3}
                className="w-full p-4 bg-gray-100 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                placeholder="Describe your planning approach..."
              />
            </div>

            {/* Goal */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">
                What do you want to achieve?
              </label>
              <textarea
                name="goal"
                value={formData.goal}
                onChange={handleInputChange}
                rows={3}
                className="w-full p-4 bg-gray-100 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                placeholder="Define your objectives..."
              />
            </div>

            {/* Activity Type */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">
                What activity type will you implement?
              </label>
              <input
                type="text"
                name="activityType"
                value={formData.activityType}
                onChange={handleInputChange}
                className="w-full p-4 bg-gray-100 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="e.g., Workshop, Training, Event..."
              />
            </div>

            {/* Participants */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">
                Who will join the activity?
              </label>
              <input
                type="text"
                name="participants"
                value={formData.participants}
                onChange={handleInputChange}
                className="w-full p-4 bg-gray-100 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Target participants..."
              />
            </div>

            {/* Budget */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">
                List your budget and cost for each item.
              </label>
              <textarea
                name="budget"
                value={formData.budget}
                onChange={handleInputChange}
                rows={3}
                className="w-full p-4 bg-gray-100 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                placeholder="Budget breakdown..."
              />
            </div>

            {/* Location */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">
                Where will this activity take place?
              </label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                className="w-full p-4 bg-gray-100 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Venue/Location..."
              />
            </div>

            {/* Date Range - Updated from single target date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">
                  Start Date
                </label>
                <input
                  type="date"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleInputChange}
                  className="w-full p-4 bg-gray-100 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">
                  End Date
                </label>
                <input
                  type="date"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleInputChange}
                  min={formData.startDate || undefined}
                  className="w-full p-4 bg-gray-100 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center gap-6 mt-10">
            <button
              onClick={handleCancel}
              disabled={isLoading}
              className="bg-yellow-500 text-white px-8 py-4 rounded-xl font-semibold hover:bg-yellow-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 min-w-[140px]"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (generatedPDFs.design && generatedPDFs.brief) {
                  window.location.assign('/transparency-report/Project-Design-Brief/PDBFile');
                } else {
                  handleGenerate();
                }
              }}
              disabled={isLoading || uploadingToFirebase.design || uploadingToFirebase.brief}
              className="bg-[#1167B1] text-white px-8 py-4 rounded-xl font-semibold hover:bg-blue-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 min-w-[140px]"
            >
              {isLoading
                ? "Generating..."
                : uploadingToFirebase.design || uploadingToFirebase.brief
                ? "Uploading..."
                : generatedPDFs.design && generatedPDFs.brief
                ? "Preview"
                : "Generate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectDesignBrief;