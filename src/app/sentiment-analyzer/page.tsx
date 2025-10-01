"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "@/app/Firebase/firebase";
import { collection, getDocs, query, where, addDoc, Timestamp } from "firebase/firestore";
import { getAuth, User } from "firebase/auth";
import Sentiment from "sentiment";
import Navbar from "../Components/Navbar";
import RequireAuth from "@/app/Components/RequireAuth";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { recordActivityLog } from "@/app/Components/recordActivityLog";

// TypeScript interfaces
interface FeedbackItem {
  feedbackId: string;
  userId: string;
  eventName: string;
  eventId: string;
  comments?: string;
  ratings?: Record<string, number>;
  timestamp?: Timestamp;
  overallSentiment?: string;
  analyzedResponses?: Record<string, { answer: string; sentiment: string; rating?: number }>;
}

interface CompiledEvent {
  eventName: string;
  eventId: string;
  feedbacks: FeedbackItem[];
  compiledResponses: Record<string, string[]>;
  compiledRatings: Record<string, number[]>;
  overallSentiment: string;
  feedbackCount: number;
  averageRatings: Record<string, number>;
  overallRating: number;
  answers?: string[];
}

const SentimentAnalyzer: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [compiledData, setCompiledData] = useState<CompiledEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CompiledEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [userDocId, setUserDocId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'name' | 'count' | 'rating' | 'sentiment'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const sentiment = useMemo(() => new Sentiment(), []);
  const auth = getAuth();
  // fetchData must be declared before useEffect to avoid TDZ error
  const fetchData = useCallback(async (currentUser?: User) => {
    const activeUser = currentUser || user;
    if (!activeUser) return;

    try {
      setLoading(true);
      setError(null);
      // Log data fetch attempt
      await recordActivityLog({
        action: 'Fetch Sentiment Data',
        details: 'User initiated sentiment data fetch',
        userId: activeUser.uid,
        userEmail: activeUser.email || undefined,
        category: 'user'
      });
      const querySnapshot = await getDocs(collection(db, "UserFeedback"));
      const fetchedData = querySnapshot.docs.map((doc) => ({
        feedbackId: doc.id,
        ...doc.data(),
      })) as FeedbackItem[];
      // Analyze each feedback
      const analyzedData = fetchedData.map((item) => {
        const analyzedResponses: Record<string, { answer: string; sentiment: string; rating?: number }> = {};
        let overallScore = 0;
        let textCount = 0;
        // Analyze comments if available
        if (item.comments && item.comments.trim()) {
          const score = sentiment.analyze(item.comments).score;
          let label = "Neutral";
          if (score > 0) label = "Positive";
          if (score < 0) label = "Negative";
          analyzedResponses["Comments"] = { answer: item.comments, sentiment: label };
          overallScore += score;
          textCount += 1;
        }
        // Process ratings and convert to sentiment-like responses
        if (item.ratings) {
          Object.entries(item.ratings).forEach(([category, rating]) => {
            let ratingText = "";
            let ratingSentiment = "Neutral";
            if (rating >= 4) {
              ratingText = `Excellent (${rating}/5)`;
              ratingSentiment = "Positive";
              overallScore += 1;
            } else if (rating >= 3) {
              ratingText = `Good (${rating}/5)`;
              ratingSentiment = "Neutral";
            } else {
              ratingText = `Needs Improvement (${rating}/5)`;
              ratingSentiment = "Negative";
              overallScore -= 1;
            }
            analyzedResponses[category.charAt(0).toUpperCase() + category.slice(1)] = { 
              answer: ratingText, 
              sentiment: ratingSentiment,
              rating: rating 
            };
            textCount += 1;
          });
        }
        // Calculate overall sentiment
        let overallSentiment = "Neutral";
        if (textCount > 0) {
          const averageScore = overallScore / textCount;
          if (averageScore > 0.3) overallSentiment = "Positive";
          else if (averageScore < -0.3) overallSentiment = "Negative";
        }
        return { ...item, analyzedResponses, overallSentiment };
      });
      // Group by event
      const eventMap: Record<string, CompiledEvent> = {};
      analyzedData.forEach((item) => {
        const eventKey = item.eventId || item.eventName;
        if (!eventKey) return;
        if (!eventMap[eventKey]) {
          eventMap[eventKey] = {
            eventName: item.eventName || "Unnamed Event",
            eventId: item.eventId || "",
            feedbacks: [],
            compiledResponses: {},
            compiledRatings: {},
            overallSentiment: "Neutral",
            feedbackCount: 0,
            averageRatings: {},
            overallRating: 0,
          };
        }
        const event = eventMap[eventKey];
        event.feedbacks.push(item);
        event.feedbackCount += 1;
        // Compile responses and ratings per question/category
        for (const [category, data] of Object.entries(item.analyzedResponses || {})) {
          if (!event.compiledResponses[category]) event.compiledResponses[category] = [];
          event.compiledResponses[category].push(data.answer);
          if (data.rating !== undefined) {
            if (!event.compiledRatings[category]) event.compiledRatings[category] = [];
            event.compiledRatings[category].push(data.rating);
          }
        }
      });
      // Calculate overall sentiment and average ratings per event
      Object.values(eventMap).forEach((event) => {
        let totalScore = 0;
        let totalRating = 0;
        let ratingCount = 0;
        // Calculate average ratings for each category
        Object.entries(event.compiledRatings).forEach(([category, ratings]) => {
          if (ratings.length > 0) {
            const avgRating = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
            event.averageRatings[category] = Math.round(avgRating * 10) / 10;
            totalRating += avgRating;
            ratingCount += 1;
          }
        });
        // Calculate overall rating
        if (ratingCount > 0) {
          event.overallRating = Math.round((totalRating / ratingCount) * 10) / 10;
        }
        // Calculate sentiment from comments and ratings
        event.feedbacks.forEach((fb) => {
          if (fb.comments) {
            const score = sentiment.analyze(fb.comments).score;
            totalScore += score;
          }
          if (fb.ratings) {
            const ratings = Object.values(fb.ratings);
            if (ratings.length > 0) {
              const avgFeedbackRating = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
              if (avgFeedbackRating >= 4) totalScore += 1;
              else if (avgFeedbackRating <= 2) totalScore -= 1;
            }
          }
        });
        // Determine overall sentiment
        if (totalScore > 0) event.overallSentiment = "Positive";
        else if (totalScore < 0) event.overallSentiment = "Negative";
        else event.overallSentiment = "Neutral";
      });
      const compiledEvents = Object.values(eventMap);
      setCompiledData(compiledEvents);
      // Log successful analysis
      await recordActivityLog({
        action: 'Analyze Sentiment - Success',
        details: `Successfully analyzed ${fetchedData.length} feedbacks across ${compiledEvents.length} events`,
        userId: activeUser.uid,
        userEmail: activeUser.email || undefined,
        category: 'user'
      });
      // Create success notification
      if (userDocId) {
        try {
          await addDoc(collection(db, "notifications"), {
            userId: userDocId,
            message: `Successfully analyzed sentiment for ${compiledEvents.length} events with ${fetchedData.length} total feedbacks`,
            type: "sentiment_analysis_success",
            createdAt: Timestamp.now(),
            read: false,
          });
        } catch (error) {
          console.error("Error creating notification:", error);
        }
      }
    } catch (error) {
      console.error("Error fetching data from Firestore:", error);
      setError(`Failed to load feedback data: ${error instanceof Error ? error.message : String(error)}`);
      // Log error
      await recordActivityLog({
        action: 'Sentiment Analysis Error',
        details: `Failed to analyze sentiment data: ${error instanceof Error ? error.message : String(error)}`,
        userId: activeUser.uid,
        userEmail: activeUser.email || undefined,
        category: 'user',
        severity: 'medium'
      });
      // Create error notification
      if (userDocId) {
        try {
          await addDoc(collection(db, "notifications"), {
            userId: userDocId,
            message: `Failed to analyze sentiment data. Please refresh the page.`,
            type: "sentiment_error",
            createdAt: Timestamp.now(),
            read: false,
          });
        } catch (notificationError) {
          console.error("Error creating notification:", notificationError);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [sentiment, user, userDocId]);
  
  


  // fetchData must be declared before useEffect to avoid TDZ error


  // Initialize user and fetch data
  useEffect(() => {
    console.log("🔄 Setting up auth state listener...");
    
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      console.log("👤 Auth state changed:", currentUser ? `User: ${currentUser.email}` : "No user");
      
      if (currentUser) {
        setUser(currentUser);

        // Log page access with enhanced debugging
        try {
          console.log("🔄 Attempting to log page access...");
          await recordActivityLog({
            action: 'View Sentiment Analyzer',
            details: 'User accessed sentiment analyzer page',
            userId: currentUser.uid,
            userEmail: currentUser.email || undefined,
            category: 'user'
          });
          console.log("✅ Page access logged successfully");
        } catch (error) {
          console.error("❌ Error logging page access:", error);
        }

        // Get user document ID for notifications
        try {
          const adminUsersRef = collection(db, "adminUsers");
          const q = query(adminUsersRef, where("uid", "==", currentUser.uid));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            setUserDocId(querySnapshot.docs[0].id);
            console.log("✅ User document ID found:", querySnapshot.docs[0].id);
          } else {
            console.log("⚠️ No user document found in adminUsers collection");
          }
        } catch (error) {
          console.error("❌ Error fetching user document:", error);
        }

        fetchData(currentUser);
      } else {
        setUser(null);
        setUserDocId(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [auth, fetchData]);



  const handleDownload = async (event: CompiledEvent, format: "pdf" | "csv" = "pdf") => {
    if (!user) return;
    
    setIsDownloading(event.eventName);

    // Log download attempt
    try {
      await recordActivityLog({
        action: `Download ${format.toUpperCase()} - Attempt`,
        details: `User initiated ${format.toUpperCase()} download for event: ${event.eventName}`,
        userId: user.uid,
        userEmail: user.email || undefined,
        category: 'user'
      });
    } catch (error) {
      console.error("Error logging download attempt:", error);
    }

    try {
      if (format === "pdf") {
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text("Event Feedback Report", 14, 20);

        doc.setFontSize(12);
        doc.text(`Event: ${event.eventName}`, 14, 30);
        doc.text(`Event ID: ${event.eventId}`, 14, 38);
        doc.text(`Feedback Count: ${event.feedbackCount}`, 14, 46);
        doc.text(`Overall Sentiment: ${event.overallSentiment}`, 14, 54);
        doc.text(`Overall Rating: ${event.overallRating}/5`, 14, 62);

        const tableData: (string | number)[][] = [];
        
        // Add ratings data
        Object.entries(event.averageRatings).forEach(([category, avgRating]) => {
          tableData.push([category, `${avgRating}/5`, "Rating"]);
        });

        // Add comments data
        Object.entries(event.compiledResponses).forEach(([category, responses]) => {
          if (category === "Comments") {
            responses.forEach((response) => {
              const score = sentiment.analyze(response).score;
              let label = "Neutral";
              if (score > 0) label = "Positive";
              if (score < 0) label = "Negative";
              const truncatedResponse = response.length > 100 
                ? response.substring(0, 97) + "..." 
                : response;
              tableData.push([category, truncatedResponse, label]);
            });
          }
        });

        // Use autoTable properly
        if (tableData.length > 0) {
          autoTable(doc, {
            startY: 70,
            head: [["Category", "Response/Rating", "Sentiment/Type"]],
            body: tableData,
            styles: { fontSize: 9, cellPadding: 2 },
            headStyles: { fillColor: [17, 103, 177] },
            columnStyles: {
              1: { cellWidth: 'auto' }
            }
          });
        }

        const fileName = `feedback_${event.eventName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split("T")[0]}.pdf`;
        doc.save(fileName);

        // Log successful PDF download
        await recordActivityLog({
          action: 'Download PDF - Success',
          details: `Successfully downloaded PDF report for event: ${event.eventName}`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'user'
        });

      } else {

      // CSV download
      let csvContent = "Category,Response/Rating,Sentiment/Type,Feedback ID,User ID,Timestamp\n";
  // let csvRowCount = 0; // Removed: not used
      event.feedbacks.forEach((fb) => {
        // Add ratings
        if (fb.ratings) {
          Object.entries(fb.ratings).forEach(([category, rating]) => {
            let sentimentLabel = "Neutral";
            if (rating >= 4) sentimentLabel = "Positive";
            else if (rating <= 2) sentimentLabel = "Negative";
            
            const timestamp = fb.timestamp?.toDate?.()?.toLocaleString() || 'N/A';
            csvContent += `"${category}","${rating}/5","Rating - ${sentimentLabel}","${fb.feedbackId}","${fb.userId}","${timestamp}"\n`;

          });
        }
        // Add comments
        if (fb.comments) {
          const score = sentiment.analyze(fb.comments).score;
          let label = "Neutral";
          if (score > 0) label = "Positive";
          if (score < 0) label = "Negative";
          
          const timestamp = fb.timestamp?.toDate?.()?.toLocaleString() || 'N/A';
          const escapedComment = fb.comments.replace(/"/g, '""');
          csvContent += `"Comments","${escapedComment}","${label}","${fb.feedbackId}","${fb.userId}","${timestamp}"\n`;

        }
      });

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const fileName = `feedback_${event.eventName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split("T")[0]}.csv`;
        link.href = url;
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        // Log successful CSV download
        await recordActivityLog({
          action: 'Download CSV - Success',
          details: `Successfully downloaded CSV report for event: ${event.eventName}`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'user'
        });
      }

      // Create success notification
      if (userDocId) {
        try {
          await addDoc(collection(db, "notifications"), {
            userId: userDocId,
            message: `Successfully downloaded ${format.toUpperCase()} report for "${event.eventName}"`,
            type: "download_success",
            createdAt: Timestamp.now(),
            read: false,
          });
        } catch (error) {
          console.error("Error creating notification:", error);
        }
      }

    } catch (error) {
      console.error("Error downloading report:", error);

      // Log download error
      await recordActivityLog({
        action: `Download ${format.toUpperCase()} - Error`,
        details: `Failed to download ${format.toUpperCase()} report for event: ${event.eventName}`,
        userId: user.uid,
        userEmail: user.email || undefined,
        category: 'user',
        severity: 'medium'
      });

      // Create error notification
      if (userDocId) {
        try {
          await addDoc(collection(db, "notifications"), {
            userId: userDocId,
            message: `Failed to download ${format.toUpperCase()} report for "${event.eventName}". Please try again.`,
            type: "download_error",
            createdAt: Timestamp.now(),
            read: false,
          });
        } catch (notificationError) {
          console.error("Error creating notification:", notificationError);
        }
      }
    } finally {
      setIsDownloading(null);
    }
  };

  const handleViewEvent = async (event: CompiledEvent) => {
    setSelectedEvent(event);

    // Log view event action
    try {
      await recordActivityLog({
        action: 'View Event Details',
        details: `User viewed detailed feedback for event: ${event.eventName}`,
        userId: user?.uid || '',
        userEmail: user?.email || undefined,
        category: 'user'
      });
    } catch (error) {
      console.error("Error logging view event:", error);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    if (query && user) {
      // Log search activity
      try {
        await recordActivityLog({
          action: 'Search Events',
          details: `User searched sentiment events with query: "${query}"`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'user'
        });
      } catch (error) {
        console.error("Error logging search:", error);
      }
    }
  };

  const handleSort = async (field: 'name' | 'count' | 'rating' | 'sentiment') => {
    const newDirection = sortField === field ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'asc';
    setSortField(field);
    setSortDirection(newDirection);

    // Log sort action
    if (user) {
      try {
        await recordActivityLog({
          action: 'Sort Events',
          details: `User sorted events by ${field} in ${newDirection} order`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'user'
        });
      } catch (error) {
        console.error("Error logging sort:", error);
      }
    }
  };


  const handleCloseModal = async () => {
    if (selectedEvent && user) {
      // Log modal close action
      try {
        await recordActivityLog({
          action: 'Close Event Details',
          details: `User closed detailed view for event: ${selectedEvent.eventName}`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'user'
        });
      } catch (error) {
        console.error("Error logging modal close:", error);
      }
    }
    
    setSelectedEvent(null);
  };

  // Filter and sort data
  const processedData = useMemo(() => {
    const filtered = compiledData.filter((item) =>
      item.eventName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Sort data
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = a.eventName.localeCompare(b.eventName);
          break;
        case 'count':
          comparison = a.feedbackCount - b.feedbackCount;
          break;
        case 'rating':
          comparison = a.overallRating - b.overallRating;
          break;
        case 'sentiment':
          const sentimentOrder = { 'Positive': 3, 'Neutral': 2, 'Negative': 1 };
          comparison = (sentimentOrder[a.overallSentiment as keyof typeof sentimentOrder] || 0) - 
                      (sentimentOrder[b.overallSentiment as keyof typeof sentimentOrder] || 0);
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [compiledData, searchQuery, sortField, sortDirection]);

  const getRatingColor = (rating: number) => {
    if (rating >= 4) return "text-green-600";
    if (rating >= 3) return "text-yellow-600";
    return "text-red-600";
  };

  const getRatingBadgeColor = (rating: number) => {
    if (rating >= 4) return "bg-green-100 text-green-800";
    if (rating >= 3) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <RequireAuth>
      <div className="ml-[260px] min-h-screen p-8 bg-[#f5f9ff] overflow-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#1167B1]">Sentiment Analyzer</h1>
            <p className="text-lg text-gray-600 mt-1">
              Analyze feedback sentiment and ratings across events ({processedData.length} events found)
            </p>
          </div>
          
          {/* Search Bar */}
          <div className="flex-1 max-w-md ml-8">
            <div className="relative">
              <input
                type="text"
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1167B1] focus:border-transparent outline-none"
              />
              <svg 
                className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Buttons */}
          {/* ...existing code... (removed Test Log and Refresh buttons) */}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button 
              onClick={() => {
                setError(null);
                fetchData();
              }}
              className="text-red-800 underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Main Table */}
        <div className="overflow-x-auto bg-white rounded-xl shadow-md">
          {loading ? (
            <div className="flex flex-col justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1167B1] mb-4"></div>
              <p className="text-gray-600">Loading feedback data...</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-[#1167B1] text-white">
                <tr>
                  <th 
                    className="px-6 py-3 cursor-pointer hover:bg-[#0E5290] transition"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1">
                      Event
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M5 12a1 1 0 102 0V6.414l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L5 6.414V12zM15 8a1 1 0 10-2 0v5.586l-1.293-1.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L15 13.586V8z"/>
                      </svg>
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-center cursor-pointer hover:bg-[#0E5290] transition"
                    onClick={() => handleSort('count')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Feedback Count
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M5 12a1 1 0 102 0V6.414l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L5 6.414V12zM15 8a1 1 0 10-2 0v5.586l-1.293-1.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L15 13.586V8z"/>
                      </svg>
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-center cursor-pointer hover:bg-[#0E5290] transition"
                    onClick={() => handleSort('rating')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Overall Rating
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M5 12a1 1 0 102 0V6.414l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L5 6.414V12zM15 8a1 1 0 10-2 0v5.586l-1.293-1.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L15 13.586V8z"/>
                      </svg>
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-center cursor-pointer hover:bg-[#0E5290] transition"
                    onClick={() => handleSort('sentiment')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Overall Sentiment
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M5 12a1 1 0 102 0V6.414l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L5 6.414V12zM15 8a1 1 0 10-2 0v5.586l-1.293-1.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L15 13.586V8z"/>
                      </svg>
                    </div>
                  </th>
                  <th className="px-6 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {processedData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      {searchQuery ? `No events found matching "${searchQuery}"` : "No feedback data available"}
                    </td>
                  </tr>
                ) : (
                  processedData.map((item, index) => (
                    <tr
                      key={`${item.eventId}-${index}`}
                      className={`${index % 2 === 0 ? "bg-[#f9fcff]" : "bg-white"} hover:bg-[#eef6ff] transition`}
                    >
                      <td className="px-6 py-4 font-medium">
                        <div>
                          <div className="font-semibold">{item.eventName}</div>
                          {item.eventId && (
                            <div className="text-xs text-gray-500">ID: {item.eventId}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-semibold">
                          {item.feedbackCount}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getRatingBadgeColor(item.overallRating || 0)}`}>
                          {item.overallRating || 0}/5 ⭐
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          item.overallSentiment === "Positive"
                            ? "bg-green-100 text-green-800"
                            : item.overallSentiment === "Negative"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-800"
                        }`}>
                          {item.overallSentiment}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center space-x-2">
                        <button
                          onClick={() => handleViewEvent(item)}
                          className="bg-[#FCD116] text-black px-4 py-1.5 rounded-lg text-sm font-medium shadow hover:bg-[#E3BC14] transition"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleDownload(item, "pdf")}
                          disabled={isDownloading === item.eventName}
                          className="bg-[#1167B1] text-white px-4 py-1.5 rounded-lg text-sm font-medium shadow hover:bg-[#0E5290] transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                          {isDownloading === item.eventName ? (
                            <div className="flex items-center gap-1">
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                              PDF
                            </div>
                          ) : (
                            "PDF"
                          )}
                        </button>
                        <button
                          onClick={() => handleDownload(item, "csv")}
                          disabled={isDownloading === item.eventName}
                          className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium shadow hover:bg-green-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                          CSV
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal */}
        {selectedEvent && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm z-50">
            <div className="relative bg-white rounded-xl shadow-lg p-6 w-[900px] max-h-[80vh] overflow-y-auto">
              {/* Close button */}
              <button
                onClick={handleCloseModal}
                className="absolute top-4 right-4 bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-700 transition"
                title="Close"
              >
                &times;
              </button>

              <h2 className="text-xl font-semibold mb-4 text-[#1167B1]">
                Feedback Details - {selectedEvent.eventName}
              </h2>

              {/* Overall Summary */}
              <div className="mb-6 p-4 rounded-lg bg-[#eef6ff] border-l-4 border-[#1167B1]">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="font-medium text-gray-800">Overall Rating:</p>
                    <p className={`text-2xl font-bold ${getRatingColor(selectedEvent.overallRating || 0)}`}>
                      {selectedEvent.overallRating || 0}/5 ⭐
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">Overall Sentiment:</p>
                    <p
                      className={`text-xl font-semibold ${
                        selectedEvent.overallSentiment === "Positive"
                          ? "text-green-600"
                          : selectedEvent.overallSentiment === "Negative"
                          ? "text-red-600"
                          : "text-gray-600"
                      }`}
                    >
                      {selectedEvent.overallSentiment}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">Total Feedbacks:</p>
                    <p className="text-xl font-semibold">{selectedEvent.feedbackCount}</p>
                  </div>
                </div>
              </div>

              {/* Average Ratings */}
              {Object.keys(selectedEvent.averageRatings).length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3 text-gray-800">Category Ratings</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(selectedEvent.averageRatings).map(([category, rating]) => (
                      <div key={category} className="bg-gray-50 p-3 rounded-lg">
                        <p className="font-medium text-gray-700 capitalize">{category}</p>
                        <p className={`text-lg font-bold ${getRatingColor(rating)}`}>
                          {rating}/5 ⭐
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Comments */}
              {selectedEvent.compiledResponses["Comments"] && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3 text-gray-800">Comments</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {selectedEvent.compiledResponses["Comments"].map((comment, i) => {
                      const score = sentiment.analyze(comment).score;
                      let label = "Neutral";
                      let labelColor = "text-gray-600";
                      if (score > 0) {
                        label = "Positive";
                        labelColor = "text-green-600";
                      }
                      if (score < 0) {
                        label = "Negative";
                        labelColor = "text-red-600";
                      }
                      return (
                        <div key={i} className="bg-gray-50 p-3 rounded border-l-4 border-gray-300">
                          <p className="text-sm text-gray-700">{comment}</p>
                          <span className={`text-xs font-semibold ${labelColor}`}>
                            Sentiment: {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

                {/* Individual Responses */}
                <div className="mt-4">
                <h2 className="text-xl font-semibold mb-2">Individual Responses</h2>
                {selectedEvent.feedbacks && selectedEvent.feedbacks.length > 0 ? (
                  selectedEvent.feedbacks.map((feedback, idx) => (
                  <div key={feedback.feedbackId || idx} className="p-2 border rounded mb-2">
                    {feedback.comments && (
                    <p className="mb-1">
                      <strong>Comment:</strong> {feedback.comments}
                    </p>
                    )}
                    {feedback.ratings && (
                    <div>
                      <strong>Ratings:</strong>
                      <ul className="list-disc list-inside">
                      {Object.entries(feedback.ratings).map(([category, rating]) => (
                        <li key={category}>
                        {category}: {rating}/5
                        </li>
                      ))}
                      </ul>
                    </div>
                    )}
                  </div>
                  ))
                ) : (
                  <p>No responses available.</p>
                )}
                </div>

              {/* Download buttons */}
              <div className="flex justify-center gap-4 mt-6">
                <button
                  onClick={() => handleDownload(selectedEvent, "csv")}
                  disabled={isDownloading === selectedEvent.eventName}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow hover:bg-green-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isDownloading === selectedEvent.eventName ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Downloading...
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd"/>
                      </svg>
                      Download CSV
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleDownload(selectedEvent, "pdf")}
                  disabled={isDownloading === selectedEvent.eventName}
                  className="bg-[#1167B1] text-white px-4 py-2 rounded-lg text-sm font-medium shadow hover:bg-[#0E5290] transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isDownloading === selectedEvent.eventName ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Downloading...
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd"/>
                      </svg>
                      Download PDF
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        <Navbar />
      </div>
    </RequireAuth>
  );
};

export default SentimentAnalyzer;
