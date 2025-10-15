/* eslint-disable @typescript-eslint/no-unused-vars */

"use client";
import { useState, ChangeEvent, useEffect } from "react";
import Link from "next/link";
import Navbar from "../../Components/Navbar";
import jsPDF from "jspdf";
import { useRouter } from "next/navigation";

// Firebase dependencies
import { app } from "@/app/Firebase/firebase";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

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
  startDate: string;
  endDate: string;
}

const ProjectDesignBrief = () => {
  const router = useRouter();
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
    startDate: "",
    endDate: "",
  });

  const [alertMessage, setAlertMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadingToFirebase, setUploadingToFirebase] = useState({
    design: false,
    brief: false,
  });

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue =
        "Once you leave this page, you cannot go back to the generated files again. Are you sure you want to leave?";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () =>
      window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const readFileAsDataURL = (file: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const compressImage = async (dataUrl: string, maxWidth = 400, quality = 0.6): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        ctx?.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.src = dataUrl;
    });
  };

  const uploadToFirebase = async (
    pdfBlob: Blob,
    type: "brief" | "design"
  ): Promise<string> => {
    try {
      setUploadingToFirebase((prev) => ({ ...prev, [type]: true }));

      const sizeInMB = pdfBlob.size / 1024 / 1024;
      console.log(`${type} PDF size: ${sizeInMB.toFixed(2)}MB`);

      if (pdfBlob.size > 5 * 1024 * 1024) {
        throw new Error(
          `PDF size (${sizeInMB.toFixed(2)}MB) exceeds 5MB limit. Current size: ${(pdfBlob.size / 1024).toFixed(0)}KB`
        );
      }

      const timestamp = Date.now();
      const filename = `reports/${
        type === "brief" ? "project-brief" : "project-design"
      }-${timestamp}.pdf`;
      const storageRef = ref(storage, filename);

      console.log(`Uploading ${type} to Firebase Storage at:`, filename);
      await uploadBytes(storageRef, pdfBlob);
      const downloadURL = await getDownloadURL(storageRef);

      console.log(`✅ ${type} PDF uploaded: ${sizeInMB.toFixed(2)}MB - ${downloadURL}`);
      return downloadURL;
    } catch (error) {
      console.error("Error uploading to Firebase:", error);
      throw new Error(
        `Failed to upload ${type} to cloud storage: ${error}`
      );
    } finally {
      setUploadingToFirebase((prev) => ({ ...prev, [type]: false }));
    }
  };

  const checkPageBreak = (
    doc: jsPDF,
    yPos: number,
    pageHeight: number,
    margin: number,
    neededHeight: number
  ): number => {
    if (yPos + neededHeight > pageHeight - margin) {
      doc.addPage();
      return margin;
    }
    return yPos;
  };

  const cleanText = (text: string): string => {
    return text
      .replace(/\*{1,3}/g, "")
      .replace(/_{1,3}/g, "")
      .replace(/#{1,6}\s?/g, "")
      .replace(/`{1,3}/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .trim();
  };

  const generateWithGemini = async (prompt: string, maxRetries = 3) => {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Calling Gemini API (Attempt ${attempt}/${maxRetries})`);
        if (attempt > 1) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.log(`Waiting ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        const requestBody = {
          contents: [
            {
              parts: [{ text: prompt }],
            },
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
              threshold: "BLOCK_MEDIUM_AND_ABOVE",
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_MEDIUM_AND_ABOVE",
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE",
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE",
            },
          ],
        };

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("API Error Response:", errorText);
          let errorMessage = "Failed to generate content";
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error?.message || errorMessage;
            if (
              errorMessage.toLowerCase().includes("overloaded") ||
              errorMessage.toLowerCase().includes("quota") ||
              errorMessage.toLowerCase().includes("rate limit") ||
              response.status === 429 ||
              response.status === 503
            ) {
              lastError = new Error(errorMessage);
              continue;
            }
          } catch (e) {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();

        if (
          !data.candidates ||
          !data.candidates[0] ||
          !data.candidates[0].content
        ) {
          throw new Error("Invalid response format from API");
        }

        const generatedText = data.candidates[0].content.parts[0].text as string;
        console.log(
          `✅ Successfully generated content on attempt ${attempt}`
        );
        return cleanText(generatedText);
      } catch (error) {
        console.error(`Error on attempt ${attempt}:`, error);
        lastError = error as Error;
        if (
          !(error as Error).message.toLowerCase().includes("overloaded") &&
          !(error as Error).message.toLowerCase().includes("quota") &&
          !(error as Error).message.toLowerCase().includes("rate limit")
        ) {
          throw error;
        }
        if (attempt === maxRetries) {
          break;
        }
      }
    }
    throw new Error(
      `Failed after ${maxRetries} attempts. Last error: ${
        lastError?.message || "Unknown error"
      }`
    );
  };

  const generateProjectDesign = async () => {
    const dateRange =
      formData.startDate === formData.endDate
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
Write a comprehensive background explaining why this project is needed. Base this on the reason provided and expand on community needs and current situations.

OBJECTIVES:
Create 3-5 clear and measurable objectives based on the goal provided. Format as:
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
Create a detailed timeline based on the activity details with phase breakdown.

METHODOLOGY / STRATEGIES:
Detail the methods and strategies to be used. Explain the approach in 2-3 paragraphs.

TYPE OF ACTIVITY:
${formData.activityType}

BUDGET:
${formData.budget}

TARGET DATE OF IMPLEMENTATION:
${dateRange}

EXPECTED OUTCOMES:
List 3-4 expected outcomes and benefits. Format as:
- [Expected outcome 1]
- [Expected outcome 2]
- [Expected outcome 3]

Use professional language, clear paragraph breaks and spacing. Do not use asterisks, markdown, or bold formatting.
    `;
    return await generateWithGemini(prompt);
  };

  const generateProjectBrief = async () => {
    const dateRange =
      formData.startDate === formData.endDate
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

Please structure the response as a table with the following rows (using pipe separators between the label and content):

PROJECT TITLE | ${formData.title}
LOCATION OF THE PROJECT | ${formData.location}
PROPOSED IMPLEMENTING AGENCY | Office of the Sangguninang Kabataan Federation
OBJECTIVE/S | [Based on the goal and reason provided]
TARGET PHYSICAL OUTPUT | [Based on activity details and expected deliverables]
TARGET BENEFICIARIES | ${formData.participants}
BUDGET | ${formData.budget}
TARGET DATE OF IMPLEMENTATION | ${dateRange}

Keep it concise and professional. DO NOT use asterisks, markdown symbols, or bold formatting.
    `;
    return await generateWithGemini(prompt);
  };

  const generatePDF = async (
    content: string,
    filename: string,
    type: "design" | "brief"
  ): Promise<Blob> => {
    try {
      const doc = new jsPDF({ 
        unit: "pt", 
        format: "a4",
        compress: true
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;
      
      let yPos = 60;

      try {
        const skLogoResponse = await fetch("/SKLogo.png");
        const skLogoBlob = await skLogoResponse.blob();
        const skLogoDataUrl = await readFileAsDataURL(skLogoBlob as Blob);
        const compressedSkLogo = await compressImage(skLogoDataUrl, 200, 0.7);
        doc.addImage(compressedSkLogo, "JPEG", margin, 38, 100, 80);

        const marikinaLogoResponse = await fetch("/MarikinaLogo.png");
        const marikinaLogoBlob = await marikinaLogoResponse.blob();
        const marikinaLogoDataUrl = await readFileAsDataURL(marikinaLogoBlob as Blob);
        const compressedMarikinaLogo = await compressImage(marikinaLogoDataUrl, 200, 0.7);
        doc.addImage(compressedMarikinaLogo, "JPEG", pageWidth - margin - 100, 38, 100, 100);
      } catch (err) {
        console.warn("Logo image failed to load", err);
      }

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

      doc.setFont("times", "bold");
      doc.setFontSize(17);
      const documentTitle = type === "design" ? "PROJECT DESIGN" : "PROJECT BRIEF";
      doc.text(documentTitle, pageWidth / 2, yPos, { align: "center" });
      yPos += 40;

      const cleanedContent = cleanText(content);

      if (type === "brief" && cleanedContent.includes("|")) {
        const lines = cleanedContent.split("\n");
        const cellPadding = 8;
        const tableMaxWidth = pageWidth - 2 * margin;
        lines.forEach((line) => {
          if (line.includes("|")) {
            const parts = line.split("|").map((part) => part.trim());
            if (parts.length >= 2) {
              const labelText = parts[0];
              const contentText = parts[1];
              const requiredLabelWidth = doc.getTextWidth(labelText) + 2 * cellPadding;
              const labelWidth = Math.min(requiredLabelWidth, tableMaxWidth * 0.5);
              const contentWidth = tableMaxWidth - labelWidth;
              
              const labelLines = doc.splitTextToSize(labelText, labelWidth - 2 * cellPadding);
              const contentLines = doc.splitTextToSize(contentText, contentWidth - 2 * cellPadding);
              const rowHeightLabel = labelLines.length * 12 + 2 * cellPadding;
              const rowHeightContent = contentLines.length * 12 + 2 * cellPadding;
              const rowHeight = Math.max(rowHeightLabel, rowHeightContent);
              yPos = checkPageBreak(doc, yPos, pageHeight, margin, rowHeight);
              
              doc.setFillColor(240, 240, 240);
              doc.rect(margin, yPos, labelWidth, rowHeight, "F");
              doc.rect(margin + labelWidth, yPos, contentWidth, rowHeight);
              
              doc.setFont("times", "bold");
              doc.setFontSize(10);
              labelLines.forEach((txt: string, i: number) => {
                doc.text(txt, margin + cellPadding, yPos + cellPadding + i * 12);
              });
              doc.setFont("times", "normal");
              contentLines.forEach((txt: string, i: number) => {
                doc.text(txt, margin + labelWidth + cellPadding, yPos + cellPadding + i * 12);
              });
              yPos += rowHeight;
            }
          } else if (line.trim().length > 0) {
            const maxWidth = pageWidth - 2 * margin;
            const splitLines = doc.splitTextToSize(line.trim(), maxWidth);
            splitLines.forEach((splitLine: string) => {
              yPos = checkPageBreak(doc, yPos, pageHeight, margin, 12);
              doc.setFont("times", "normal");
              doc.setFontSize(11);
              doc.text(splitLine, margin, yPos);
              yPos += 12;
            });
          }
        });
      } else {
        const lines = cleanedContent.split("\n");
        const lineHeight = 12;
        lines.forEach((line) => {
          if (
            line.trim().endsWith(":") &&
            line.trim() === line.trim().toUpperCase()
          ) {
            doc.setFont("times", "bold");
            doc.setFontSize(12);
            yPos += 8;
          } else if (line.trim().length === 0) {
            yPos += lineHeight / 2;
            return;
          } else {
            doc.setFont("times", "normal");
            doc.setFontSize(11);
          }
          const maxWidth = pageWidth - 2 * margin;
          const splitLines = doc.splitTextToSize(line.trim(), maxWidth);
          splitLines.forEach((splitLine: string) => {
            yPos = checkPageBreak(doc, yPos, pageHeight, margin, lineHeight);
            doc.text(splitLine, margin, yPos);
            yPos += lineHeight;
          });
          if (
            line.trim().endsWith(":") &&
            line.trim() === line.trim().toUpperCase()
          ) {
            yPos += 5;
          }
        });
      }

      const pdfArrayBuffer = doc.output("arraybuffer");
      const pdfBlob = new Blob([pdfArrayBuffer], { type: "application/pdf" });

      const sizeInMB = (pdfBlob.size / 1024 / 1024).toFixed(2);
      console.log(`Generated PDF size: ${sizeInMB}MB`);

      return pdfBlob;
    } catch (error) {
      console.error("Error generating PDF:", error);
      throw new Error("Failed to generate PDF");
    }
  };

  const handleGenerate = async () => {
    const emptyFields = Object.entries(formData)
      .filter(([key, value]) => value.trim() === "")
      .map(([key]) => key);
    if (emptyFields.length > 0) {
      setAlertMessage(`Please fill in all fields. Missing: ${emptyFields.join(", ")}`);
      return;
    }

    if (
      formData.startDate &&
      formData.endDate &&
      formData.startDate > formData.endDate
    ) {
      setAlertMessage("Start date cannot be later than end date.");
      return;
    }

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
      setAlertMessage("🔄 Generating documents with AI...");
      const [projectDesignContent, projectBriefContent] = await Promise.all([
        generateProjectDesign(),
        generateProjectBrief(),
      ]);
      console.log("Documents generated, creating PDFs...");
      setAlertMessage("🔄 Creating PDF documents...");

      const designBlob = await generatePDF(
        projectDesignContent,
        `${formData.title || "Project"}_Design.pdf`,
        "design"
      );
      const briefBlob = await generatePDF(
        projectBriefContent,
        `${formData.title || "Project"}_Brief.pdf`,
        "brief"
      );

      setAlertMessage("🔄 Uploading to cloud storage...");
      const [designUrl, briefUrl] = await Promise.all([
        uploadToFirebase(designBlob, "design"),
        uploadToFirebase(briefBlob, "brief"),
      ]);

      const designDataUrl = URL.createObjectURL(designBlob);
      const briefDataUrl = URL.createObjectURL(briefBlob);

      setAlertMessage(
        "✅ Both Project Design and Project Brief have been generated successfully!"
      );
      console.log("Process completed successfully");

      const queryParams = new URLSearchParams({
        design: designDataUrl,
        brief: briefDataUrl,
        designUrl: designUrl,
        briefUrl: briefUrl,
        title: formData.title,
      });

      router.push(
        `/transparency-report/Project-Design-Brief/PDBFile?${queryParams.toString()}`
      );
    } catch (error) {
      console.error("Error in handleGenerate:", error);
      let errorMessage = "❌ Error generating documents. ";
      if (error instanceof Error) {
        if (error.message.includes("API key")) {
          errorMessage += "Please check your Gemini API key.";
        } else if (error.message.includes("quota")) {
          errorMessage += "API quota exceeded. Please try again later.";
        } else if (error.message.includes("5MB")) {
          errorMessage +=
            "Generated PDF exceeds 5MB size limit. Try with less detailed input.";
        } else if (
          error.message.includes("network") ||
          error.message.includes("fetch")
        ) {
          errorMessage += "Network error. Please check your internet connection.";
        } else if (error.message.includes("cloud storage")) {
          errorMessage +=
            "Failed to upload to cloud storage, but PDFs were generated locally.";
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
      startDate: "",
      endDate: "",
    });
    setAlertMessage("Form has been reset.");
  };

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-800">
          Transparency Report
        </h1>
        <p className="text-lg text-gray-600 mt-1">
          Create reports and activities for internal tracking.
        </p>
      </div>
      <div className="w-full bg-white rounded-xl shadow-md">
        <div className="relative bg-[#1167B1] text-white px-6 py-4 rounded-t-xl">
          <Link href="/transparency-report">
            <button className="absolute left-6 top-1/2 -translate-y-1/2 text-xl hover:opacity-80">
              ←
            </button>
          </Link>
          <h2 className="text-center text-3xl font-semibold">
            Project Design and Brief
          </h2>
        </div>
        <Navbar />

        {alertMessage && (
          <div className="mx-6 mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-800">
            {alertMessage}
          </div>
        )}

        <div className="p-8">
          <div className="space-y-6">
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

          <div className="flex justify-center gap-6 mt-10">
            <button
              onClick={handleCancel}
              disabled={isLoading}
              className="bg-yellow-500 text-white px-8 py-4 rounded-xl font-semibold hover:bg-yellow-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 min-w-[140px]"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={
                isLoading ||
                uploadingToFirebase.design ||
                uploadingToFirebase.brief
              }
              className="bg-[#1167B1] text-white px-8 py-4 rounded-xl font-semibold hover:bg-blue-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 min-w-[140px]"
            >
              {isLoading ||
              uploadingToFirebase.design ||
              uploadingToFirebase.brief
                ? "Generating..."
                : "Generate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectDesignBrief;