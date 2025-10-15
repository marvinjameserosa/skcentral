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
  sentimentMatch?: boolean;
  accuracyScore?: number;
}

interface AccuracyMetrics {
  TP: number; // True Positive: Positive sentiment matches positive rating (>=4)
  TN: number; // True Negative: Negative sentiment matches negative rating (<=2)
  FP: number; // False Positive: Positive sentiment but negative rating
  FN: number; // False Negative: Negative sentiment but positive rating
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  totalValidated: number;
  confidenceLevel: string;
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
  accuracyMetrics?: AccuracyMetrics;
  matchingFeedbacks: number;
  mismatchingFeedbacks: number;
  reliabilityScore: number;
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
  const [sortField, setSortField] = useState<'name' | 'count' | 'rating' | 'sentiment' | 'accuracy'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const sentiment = useMemo(() => new Sentiment(), []);
  const auth = getAuth();

  // Function to determine sentiment from rating
  const getSentimentFromRating = (rating: number): string => {
    if (rating >= 4) return "Positive";
    if (rating <= 2) return "Negative";
    return "Neutral";
  };

  // Function to determine sentiment from comment
  const getSentimentFromComment = useCallback((comment: string): string => {
    const score = sentiment.analyze(comment).score;
    if (score > 0) return "Positive";
    if (score < 0) return "Negative";
    return "Neutral";
  }, [sentiment]);

  // Function to get confidence level based on accuracy
  const getConfidenceLevel = (accuracy: number): string => {
    if (accuracy >= 90) return "Very High";
    if (accuracy >= 80) return "High";
    if (accuracy >= 70) return "Moderate";
    if (accuracy >= 60) return "Low";
    return "Very Low";
  };

  // Enhanced accuracy calculation with additional metrics
  const calculateAccuracy = useCallback((feedbacks: FeedbackItem[]): AccuracyMetrics => {
    let TP = 0, TN = 0, FP = 0, FN = 0;

    feedbacks.forEach((feedback) => {
      if (feedback.comments && feedback.ratings) {
        const commentSentiment = getSentimentFromComment(feedback.comments);
        // Get average rating for this feedback
        const ratings = Object.values(feedback.ratings);
        if (ratings.length > 0) {
          const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
          const ratingSentiment = getSentimentFromRating(avgRating);

          // Skip neutral sentiments for accuracy calculation
          if (commentSentiment !== "Neutral" && ratingSentiment !== "Neutral") {
            if (commentSentiment === "Positive" && ratingSentiment === "Positive") {
              TP++; // True Positive
            } else if (commentSentiment === "Negative" && ratingSentiment === "Negative") {
              TN++; // True Negative
            } else if (commentSentiment === "Positive" && ratingSentiment === "Negative") {
              FP++; // False Positive
            } else if (commentSentiment === "Negative" && ratingSentiment === "Positive") {
              FN++; // False Negative
            }
          }
        }
      }
    });

    const totalValidated = TP + TN + FP + FN;
    const accuracy = totalValidated > 0 ? ((TP + TN) / totalValidated) * 100 : 0;
    
    // Calculate Precision: TP / (TP + FP)
    const precision = (TP + FP) > 0 ? (TP / (TP + FP)) * 100 : 0;
    
    // Calculate Recall: TP / (TP + FN)
    const recall = (TP + FN) > 0 ? (TP / (TP + FN)) * 100 : 0;
    
    // Calculate F1 Score: 2 * (Precision * Recall) / (Precision + Recall)
    const f1Score = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    
    const confidenceLevel = getConfidenceLevel(accuracy);

    return { 
      TP, 
      TN, 
      FP, 
      FN, 
      accuracy, 
      precision,
      recall,
      f1Score,
      totalValidated,
      confidenceLevel
    };
  }, [getSentimentFromComment]);

  // Calculate individual feedback accuracy score
  const calculateFeedbackAccuracyScore = useCallback((feedback: FeedbackItem): number => {
    if (!feedback.comments || !feedback.ratings) return 0;

    const ratings = Object.values(feedback.ratings);
    
    if (ratings.length === 0) return 0;

    const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;

    // Calculate sentiment score (-1 to 1)
    const sentimentScore = sentiment.analyze(feedback.comments).score;
    const normalizedSentiment = Math.max(-1, Math.min(1, sentimentScore / 5));

    // Normalize rating to -1 to 1 scale (1-5 rating scale)
    const normalizedRating = (avgRating - 3) / 2;

    // Calculate difference (0 means perfect match, 2 means complete opposite)
    const difference = Math.abs(normalizedSentiment - normalizedRating);

    // Convert to percentage (0 difference = 100%, 2 difference = 0%)
    const accuracyScore = Math.max(0, (1 - (difference / 2)) * 100);

    return accuracyScore;
  }, [sentiment]);

  const fetchData = useCallback(async (currentUser?: User) => {
    const activeUser = currentUser || user;
    if (!activeUser) return;

    try {
      setLoading(true);
      setError(null);
      
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
        let commentSentiment: string | null = null;
        let averageRating = 0;
        let ratingCount = 0;

        // Analyze comments if available
        if (item.comments && item.comments.trim()) {
          commentSentiment = getSentimentFromComment(item.comments);
          const score = sentiment.analyze(item.comments).score;
          analyzedResponses["Comments"] = { answer: item.comments, sentiment: commentSentiment };
          overallScore += score;
          textCount += 1;
        }

        // Process ratings
        if (item.ratings) {
          Object.entries(item.ratings).forEach(([category, rating]) => {
            let ratingText = "";
            const ratingSentiment = getSentimentFromRating(rating);
            
            if (rating >= 4) {
              ratingText = `Excellent (${rating}/5)`;
              overallScore += 1;
            } else if (rating >= 3) {
              ratingText = `Good (${rating}/5)`;
            } else {
              ratingText = `Needs Improvement (${rating}/5)`;
              overallScore -= 1;
            }

            analyzedResponses[category.charAt(0).toUpperCase() + category.slice(1)] = { 
              answer: ratingText, 
              sentiment: ratingSentiment,
              rating: rating 
            };
            textCount += 1;
            averageRating += rating;
            ratingCount += 1;
          });
        }

        // Check if sentiment matches rating
        let sentimentMatch = true;
        let accuracyScore = 0;

        if (commentSentiment && ratingCount > 0) {
          averageRating = averageRating / ratingCount;
          const ratingSentiment = getSentimentFromRating(averageRating);
          sentimentMatch = commentSentiment === ratingSentiment || 
                          commentSentiment === "Neutral" || 
                          ratingSentiment === "Neutral";
          
          // Calculate accuracy score for this feedback
          accuracyScore = calculateFeedbackAccuracyScore(item);
        }

        // Calculate overall sentiment
        let overallSentiment = "Neutral";
        if (textCount > 0) {
          const averageScore = overallScore / textCount;
          if (averageScore > 0.3) overallSentiment = "Positive";
          else if (averageScore < -0.3) overallSentiment = "Negative";
        }

        return { ...item, analyzedResponses, overallSentiment, sentimentMatch, accuracyScore };
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
            matchingFeedbacks: 0,
            mismatchingFeedbacks: 0,
            reliabilityScore: 0,
          };
        }

        const event = eventMap[eventKey];
        event.feedbacks.push(item);
        event.feedbackCount += 1;

        // Track matching/mismatching feedbacks
        if (item.sentimentMatch) {
          event.matchingFeedbacks += 1;
        } else {
          event.mismatchingFeedbacks += 1;
        }

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

      // Calculate overall sentiment, ratings, and accuracy per event
      Object.values(eventMap).forEach((event) => {
        let totalScore = 0;
        let totalRating = 0;
        let ratingCount = 0;
        let totalAccuracyScore = 0;
        let accuracyCount = 0;

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
          
          // Accumulate accuracy scores
          if (fb.accuracyScore !== undefined && fb.accuracyScore > 0) {
            totalAccuracyScore += fb.accuracyScore;
            accuracyCount += 1;
          }
        });

        // Calculate reliability score (average of individual accuracy scores)
        event.reliabilityScore = accuracyCount > 0 ? totalAccuracyScore / accuracyCount : 0;

        // Determine overall sentiment based on ratings
        const overallRating = event.overallRating;
        if (overallRating >= 4) {
          event.overallSentiment = "Positive";
        } else if (overallRating <= 2) {
          event.overallSentiment = "Negative";
        } else if (overallRating > 2 && overallRating < 4) {
          event.overallSentiment = "Neutral";
        } else {
          // Fallback to score-based sentiment if no ratings
          if (totalScore > 0) event.overallSentiment = "Positive";
          else if (totalScore < 0) event.overallSentiment = "Negative";
          else event.overallSentiment = "Neutral";
        }

        // Calculate accuracy metrics
        event.accuracyMetrics = calculateAccuracy(event.feedbacks);
      });

      const compiledEvents = Object.values(eventMap);
      setCompiledData(compiledEvents);

      await recordActivityLog({
        action: 'Analyze Sentiment - Success',
        details: `Successfully analyzed ${fetchedData.length} feedbacks across ${compiledEvents.length} events`,
        userId: activeUser.uid,
        userEmail: activeUser.email || undefined,
        category: 'user'
      });

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
      
      await recordActivityLog({
        action: 'Sentiment Analysis Error',
        details: `Failed to analyze sentiment data: ${error instanceof Error ? error.message : String(error)}`,
        userId: activeUser.uid,
        userEmail: activeUser.email || undefined,
        category: 'user',
        severity: 'medium'
      });

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
  }, [calculateAccuracy, calculateFeedbackAccuracyScore, getSentimentFromComment, sentiment, user, userDocId]);

  // Initialize user and fetch data
  useEffect(() => {
    console.log("🔄 Setting up auth state listener...");
    
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      console.log("👤 Auth state changed:", currentUser ? `User: ${currentUser.email}` : "No user");
      
      if (currentUser) {
        setUser(currentUser);

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
        
        // Add accuracy metrics
        if (event.accuracyMetrics) {
          doc.text(`Accuracy: ${event.accuracyMetrics.accuracy.toFixed(2)}%`, 14, 70);
          doc.text(`Confidence Level: ${event.accuracyMetrics.confidenceLevel}`, 14, 78);
          doc.text(`Precision: ${event.accuracyMetrics.precision.toFixed(2)}%`, 14, 86);
          doc.text(`Recall: ${event.accuracyMetrics.recall.toFixed(2)}%`, 14, 94);
          doc.text(`F1 Score: ${event.accuracyMetrics.f1Score.toFixed(2)}`, 14, 102);
          doc.text(`Reliability Score: ${event.reliabilityScore.toFixed(2)}%`, 14, 110);
        }

        const tableData: (string | number)[][] = [];
        
        // Add ratings data
        Object.entries(event.averageRatings).forEach(([category, avgRating]) => {
          tableData.push([category, `${avgRating}/5`, "Rating"]);
        });

        // Add comments data
        Object.entries(event.compiledResponses).forEach(([category, responses]) => {
          if (category === "Comments") {
            responses.forEach((response) => {
              const commentSentiment = getSentimentFromComment(response);
              const truncatedResponse = response.length > 100 
                ? response.substring(0, 97) + "..." 
                : response;
              tableData.push([category, truncatedResponse, commentSentiment]);
            });
          }
        });

        if (tableData.length > 0) {
          autoTable(doc, {
            startY: 118,
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

        await recordActivityLog({
          action: 'Download PDF - Success',
          details: `Successfully downloaded PDF report for event: ${event.eventName}`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'user'
        });

      } else {
        // CSV download
        let csvContent = "Category,Response/Rating,Sentiment/Type,Match,Accuracy Score,Feedback ID,User ID,Timestamp\n";
        
        event.feedbacks.forEach((fb) => {
          const timestamp = fb.timestamp?.toDate?.()?.toLocaleString() || 'N/A';
          const matchStatus = fb.sentimentMatch ? 'Yes' : 'No';
          const accuracyScore = fb.accuracyScore?.toFixed(2) || 'N/A';

          // Add ratings
          if (fb.ratings) {
            Object.entries(fb.ratings).forEach(([category, rating]) => {
              const ratingSentiment = getSentimentFromRating(rating);
              csvContent += `"${category}","${rating}/5","Rating - ${ratingSentiment}","${matchStatus}","${accuracyScore}","${fb.feedbackId}","${fb.userId}","${timestamp}"\n`;
            });
          }

          // Add comments
          if (fb.comments) {
            const commentSentiment = getSentimentFromComment(fb.comments);
            const escapedComment = fb.comments.replace(/"/g, '""');
            csvContent += `"Comments","${escapedComment}","${commentSentiment}","${matchStatus}","${accuracyScore}","${fb.feedbackId}","${fb.userId}","${timestamp}"\n`;
          }
        });

        // Add accuracy summary
        if (event.accuracyMetrics) {
          csvContent += `\nAccuracy Metrics\n`;
          csvContent += `True Positives (TP),${event.accuracyMetrics.TP}\n`;
          csvContent += `True Negatives (TN),${event.accuracyMetrics.TN}\n`;
          csvContent += `False Positives (FP),${event.accuracyMetrics.FP}\n`;
          csvContent += `False Negatives (FN),${event.accuracyMetrics.FN}\n`;
          csvContent += `Accuracy,${event.accuracyMetrics.accuracy.toFixed(2)}%\n`;
          csvContent += `Precision,${event.accuracyMetrics.precision.toFixed(2)}%\n`;
          csvContent += `Recall,${event.accuracyMetrics.recall.toFixed(2)}%\n`;
          csvContent += `F1 Score,${event.accuracyMetrics.f1Score.toFixed(2)}\n`;
          csvContent += `Confidence Level,${event.accuracyMetrics.confidenceLevel}\n`;
          csvContent += `Reliability Score,${event.reliabilityScore.toFixed(2)}%\n`;
          csvContent += `Total Validated,${event.accuracyMetrics.totalValidated}\n`;
        }

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

        await recordActivityLog({
          action: 'Download CSV - Success',
          details: `Successfully downloaded CSV report for event: ${event.eventName}`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'user'
        });
      }

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

      await recordActivityLog({
        action: `Download ${format.toUpperCase()} - Error`,
        details: `Failed to download ${format.toUpperCase()} report for event: ${event.eventName}`,
        userId: user.uid,
        userEmail: user.email || undefined,
        category: 'user',
        severity: 'medium'
      });

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

  const handleSort = async (field: 'name' | 'count' | 'rating' | 'sentiment' | 'accuracy') => {
    const newDirection = sortField === field ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'asc';
    setSortField(field);
    setSortDirection(newDirection);

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
        case 'accuracy':
          comparison = (a.accuracyMetrics?.accuracy || 0) - (b.accuracyMetrics?.accuracy || 0);
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

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 80) return "text-green-600";
    if (accuracy >= 60) return "text-yellow-600";
    return "text-red-600";
  };


  const getReliabilityBadgeColor = (score: number) => {
    if (score >= 85) return "bg-green-100 text-green-800";
    if (score >= 70) return "bg-yellow-100 text-yellow-800";
    if (score >= 50) return "bg-orange-100 text-orange-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <RequireAuth>
      <div className="ml-[260px] min-h-screen p-8 bg-[#f5f9ff] overflow-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#1167B1]">Feedbacks</h1>
            <p className="text-lg text-gray-600 mt-1">
              View and Analyze feedback sentiment and ratings across events ({processedData.length} events found)
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
                  <th 
                    className="px-6 py-3 text-center cursor-pointer hover:bg-[#0E5290] transition"
                    onClick={() => handleSort('accuracy')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Reliability
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
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
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
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getReliabilityBadgeColor(item.reliabilityScore)}`}>
                            {item.reliabilityScore.toFixed(1)}%
                          </span>
                          {item.accuracyMetrics && item.accuracyMetrics.totalValidated > 0 && (
                            <span className="text-xs text-gray-500">
                              {item.accuracyMetrics.confidenceLevel}
                            </span>
                          )}
                        </div>
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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                  <div>
                    <p className="font-medium text-gray-800">Reliability Score:</p>
                    <p className={`text-xl font-semibold ${getAccuracyColor(selectedEvent.reliabilityScore)}`}>
                      {selectedEvent.reliabilityScore.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Enhanced Accuracy Metrics Section */}
              {selectedEvent.accuracyMetrics && selectedEvent.accuracyMetrics.totalValidated > 0 && (
                <div className="mb-6 p-4 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200">
                  <h3 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                    </svg>
                    Sentiment-Rating Accuracy Analysis
                  </h3>
                  
                  {/* Confidence Badge */}
                  <div className="mb-4 flex items-center justify-between">
                    <span className={`px-4 py-2 rounded-lg text-sm font-bold ${
                      selectedEvent.accuracyMetrics.confidenceLevel === "Very High" ? "bg-green-200 text-green-900" :
                      selectedEvent.accuracyMetrics.confidenceLevel === "High" ? "bg-green-100 text-green-800" :
                      selectedEvent.accuracyMetrics.confidenceLevel === "Moderate" ? "bg-yellow-100 text-yellow-800" :
                      selectedEvent.accuracyMetrics.confidenceLevel === "Low" ? "bg-orange-100 text-orange-800" :
                      "bg-red-100 text-red-800"
                    }`}>
                      Confidence Level: {selectedEvent.accuracyMetrics.confidenceLevel}
                    </span>
                    <span className="text-sm text-gray-600">
                      Based on {selectedEvent.accuracyMetrics.totalValidated} validated feedbacks
                    </span>
                  </div>

                  {/* Confusion Matrix */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-white p-4 rounded-lg border-2 border-green-300 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-gray-600">True Positives</p>
                        <span className="text-green-600">✓</span>
                      </div>
                      <p className="text-2xl font-bold text-green-600">{selectedEvent.accuracyMetrics.TP}</p>
                      <p className="text-xs text-gray-500 mt-1">Positive matched</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border-2 border-green-300 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-gray-600">True Negatives</p>
                        <span className="text-green-600">✓</span>
                      </div>
                      <p className="text-2xl font-bold text-green-600">{selectedEvent.accuracyMetrics.TN}</p>
                      <p className="text-xs text-gray-500 mt-1">Negative matched</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border-2 border-red-300 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-gray-600">False Positives</p>
                        <span className="text-red-600">✗</span>
                      </div>
                      <p className="text-2xl font-bold text-red-600">{selectedEvent.accuracyMetrics.FP}</p>
                      <p className="text-xs text-gray-500 mt-1">Positive mismatched</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border-2 border-red-300 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-gray-600">False Negatives</p>
                        <span className="text-red-600">✗</span>
                      </div>
                      <p className="text-2xl font-bold text-red-600">{selectedEvent.accuracyMetrics.FN}</p>
                      <p className="text-xs text-gray-500 mt-1">Negative mismatched</p>
                    </div>
                  </div>

                  {/* Performance Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-white p-3 rounded-lg border shadow-sm">
                      <p className="text-xs font-medium text-gray-600 mb-1">Accuracy</p>
                      <p className={`text-xl font-bold ${getAccuracyColor(selectedEvent.accuracyMetrics.accuracy)}`}>
                        {selectedEvent.accuracyMetrics.accuracy.toFixed(2)}%
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Overall correctness</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border shadow-sm">
                      <p className="text-xs font-medium text-gray-600 mb-1">Precision</p>
                      <p className={`text-xl font-bold ${getAccuracyColor(selectedEvent.accuracyMetrics.precision)}`}>
                        {selectedEvent.accuracyMetrics.precision.toFixed(2)}%
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Positive accuracy</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border shadow-sm">
                      <p className="text-xs font-medium text-gray-600 mb-1">Recall</p>
                      <p className={`text-xl font-bold ${getAccuracyColor(selectedEvent.accuracyMetrics.recall)}`}>
                        {selectedEvent.accuracyMetrics.recall.toFixed(2)}%
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Detection rate</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border shadow-sm">
                      <p className="text-xs font-medium text-gray-600 mb-1">F1 Score</p>
                      <p className={`text-xl font-bold ${getAccuracyColor(selectedEvent.accuracyMetrics.f1Score)}`}>
                        {selectedEvent.accuracyMetrics.f1Score.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Harmonic mean</p>
                    </div>
                  </div>

                  {/* Formula Explanations */}
                  <div className="bg-white p-4 rounded-lg border">
                    <p className="text-sm font-semibold text-gray-800 mb-3">📊 How These Metrics Work:</p>
                    <div className="space-y-2 text-xs text-gray-700">
                      <div className="flex items-start gap-2">
                        <span className="font-semibold min-w-20">Accuracy:</span>
                        <span>(TP + TN) / (TP + TN + FP + FN) = ({selectedEvent.accuracyMetrics.TP} + {selectedEvent.accuracyMetrics.TN}) / {selectedEvent.accuracyMetrics.totalValidated} = {selectedEvent.accuracyMetrics.accuracy.toFixed(2)}%</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-semibold min-w-20">Precision:</span>
                        <span>TP / (TP + FP) - Measures how many positive predictions were correct</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-semibold min-w-20">Recall:</span>
                        <span>TP / (TP + FN) - Measures how many actual positives were detected</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-semibold min-w-20">F1 Score:</span>
                        <span>2 × (Precision × Recall) / (Precision + Recall) - Balanced metric</span>
                      </div>
                    </div>
                  </div>

                  {/* Match Statistics */}
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-green-800">Matching Feedbacks</p>
                        <span className="text-2xl">✓</span>
                      </div>
                      <p className="text-3xl font-bold text-green-600">{selectedEvent.matchingFeedbacks}</p>
                      <p className="text-xs text-green-700 mt-1">
                        Sentiment aligns with ratings
                      </p>
                      <div className="mt-2 bg-green-100 rounded-full h-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${(selectedEvent.matchingFeedbacks / selectedEvent.feedbackCount) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className="bg-red-50 p-4 rounded-lg border-2 border-red-200">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-red-800">Mismatching Feedbacks</p>
                        <span className="text-2xl">✗</span>
                      </div>
                      <p className="text-3xl font-bold text-red-600">{selectedEvent.mismatchingFeedbacks}</p>
                      <p className="text-xs text-red-700 mt-1">
                        Sentiment conflicts with ratings
                      </p>
                      <div className="mt-2 bg-red-100 rounded-full h-2">
                        <div 
                          className="bg-red-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${(selectedEvent.mismatchingFeedbacks / selectedEvent.feedbackCount) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  {/* Interpretation Guide */}
                  <div className="mt-4 bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <p className="text-sm font-semibold text-blue-900 mb-2">💡 What This Means:</p>
                    <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                      <li><strong>High Accuracy ({">"}85%):</strong> Comments strongly reflect the ratings - feedback is highly reliable</li>
                      <li><strong>Moderate Accuracy (70-85%):</strong> Generally consistent - some nuanced opinions may differ</li>
                      <li><strong>Low Accuracy ({"<"}70%):</strong> Comments may not fully align with ratings - review individual feedbacks</li>
                      <li><strong>Reliability Score:</strong> Average accuracy across all individual feedbacks for this event</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Average Ratings */}
              {Object.keys(selectedEvent.averageRatings).length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3 text-gray-800">Category Ratings</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(selectedEvent.averageRatings).map(([category, rating]) => (
                      <div key={category} className="bg-gray-50 p-3 rounded-lg border">
                        <p className="font-medium text-gray-700 capitalize">{category}</p>
                        <p className={`text-lg font-bold ${getRatingColor(rating)}`}>
                          {rating}/5 ⭐
                        </p>
                        <div className="mt-2 bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all duration-500 ${
                              rating >= 4 ? 'bg-green-500' : rating >= 3 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${(rating / 5) * 100}%` }}
                          ></div>
                        </div>
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
                      const commentSentiment = getSentimentFromComment(comment);
                      const labelColor = commentSentiment === "Positive" ? "text-green-600" : 
                                        commentSentiment === "Negative" ? "text-red-600" : "text-gray-600";
                      const borderColor = commentSentiment === "Positive" ? "border-green-300" : 
                                         commentSentiment === "Negative" ? "border-red-300" : "border-gray-300";
                      
                      return (
                        <div key={i} className={`bg-gray-50 p-3 rounded border-l-4 ${borderColor}`}>
                          <p className="text-sm text-gray-700">{comment}</p>
                          <span className={`text-xs font-semibold ${labelColor}`}>
                            Sentiment: {commentSentiment}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Individual Responses with Enhanced Accuracy Display */}
              <div className="mt-4">
                <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                  Individual Responses
                  <span className="text-sm font-normal text-gray-500">
                    ({selectedEvent.feedbacks.length} total)
                  </span>
                </h2>
                {selectedEvent.feedbacks && selectedEvent.feedbacks.length > 0 ? (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {selectedEvent.feedbacks.map((feedback, idx) => {
                      const isMatch = feedback.sentimentMatch !== false;
                      const accuracyScore = feedback.accuracyScore || 0;
                      
                      return (
                        <div 
                          key={feedback.feedbackId || idx} 
                          className={`p-4 border-2 rounded-lg ${
                            isMatch ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
                          } hover:shadow-md transition-shadow`}
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                                isMatch ? 'bg-green-200 text-green-900' : 'bg-red-200 text-red-900'
                              }`}>
                                {isMatch ? '✓ Match' : '✗ Mismatch'}
                              </span>
                              {accuracyScore > 0 && (
                                <span className={`text-xs font-semibold px-2 py-1 rounded ${
                                  accuracyScore >= 85 ? 'bg-green-100 text-green-800' :
                                  accuracyScore >= 70 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-orange-100 text-orange-800'
                                }`}>
                                  Score: {accuracyScore.toFixed(1)}%
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-500">
                              {feedback.timestamp?.toDate?.()?.toLocaleString() || 'N/A'}
                            </span>
                          </div>

                          {/* Accuracy Score Bar */}
                          {accuracyScore > 0 && (
                            <div className="mb-3">
                              <div className="flex justify-between text-xs text-gray-600 mb-1">
                                <span>Alignment Score</span>
                                <span className="font-semibold">{accuracyScore.toFixed(1)}%</span>
                              </div>
                              <div className="bg-gray-200 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full transition-all duration-500 ${
                                    accuracyScore >= 85 ? 'bg-green-500' :
                                    accuracyScore >= 70 ? 'bg-yellow-500' :
                                    'bg-orange-500'
                                  }`}
                                  style={{ width: `${accuracyScore}%` }}
                                ></div>
                              </div>
                            </div>
                          )}

                          {feedback.comments && (
                            <div className="mb-3 p-3 bg-white rounded border">
                              <p className="text-sm font-semibold text-gray-700 mb-1">Comment:</p>
                              <p className="text-sm text-gray-800">{feedback.comments}</p>
                              <div className="mt-2 flex items-center gap-2">
                                <span className={`text-xs font-bold px-2 py-1 rounded ${
                                  getSentimentFromComment(feedback.comments) === "Positive" ? 'bg-green-100 text-green-800' :
                                  getSentimentFromComment(feedback.comments) === "Negative" ? 'bg-red-100 text-red-800' : 
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {getSentimentFromComment(feedback.comments)} Sentiment
                                </span>
                              </div>
                            </div>
                          )}
                          
                          {feedback.ratings && (
                            <div className="p-3 bg-white rounded border">
                              <p className="text-sm font-semibold text-gray-700 mb-2">Ratings:</p>
                              <div className="grid grid-cols-2 gap-2">
                                {Object.entries(feedback.ratings).map(([category, rating]) => {
                                  const ratingSentiment = getSentimentFromRating(rating);
                                  return (
                                    <div key={category} className="flex items-center justify-between text-sm">
                                      <span className="text-gray-700">{category}:</span>
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold">{rating}/5</span>
                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                          ratingSentiment === "Positive" ? 'bg-green-100 text-green-700' :
                                          ratingSentiment === "Negative" ? 'bg-red-100 text-red-700' : 
                                          'bg-gray-100 text-gray-700'
                                        }`}>
                                          {ratingSentiment}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {feedback.ratings && Object.keys(feedback.ratings).length > 0 && (
                                <div className="mt-2 pt-2 border-t">
                                  <div className="flex justify-between text-xs">
                                    <span className="text-gray-600">Average:</span>
                                    <span className={`font-bold ${getRatingColor(
                                      Object.values(feedback.ratings).reduce((a, b) => a + b, 0) / Object.values(feedback.ratings).length
                                    )}`}>
                                      {(Object.values(feedback.ratings).reduce((a, b) => a + b, 0) / Object.values(feedback.ratings).length).toFixed(1)}/5
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Explanation for mismatch */}
                          {!isMatch && feedback.comments && feedback.ratings && (
                            <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                              <strong>⚠️ Why Mismatch:</strong> The sentiment expressed in the comment does not align with the average rating score.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No responses available.</p>
                )}
              </div>

              {/* Download buttons */}
              <div className="flex justify-center gap-4 mt-6 pt-6 border-t">
                <button
                  onClick={() => handleDownload(selectedEvent, "csv")}
                  disabled={isDownloading === selectedEvent.eventName}
                  className="bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium shadow hover:bg-green-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
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
                  className="bg-[#1167B1] text-white px-6 py-2.5 rounded-lg text-sm font-medium shadow hover:bg-[#0E5290] transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
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