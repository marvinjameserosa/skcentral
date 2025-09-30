"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/app/Firebase/firebase";

export interface ActivityLogParams {
  action: string;           // What action was performed
  details?: string;         // Additional details about the action
  userId: string;          // User who performed the action
  userEmail?: string;      // User's email
  category?: string;       // Category of the action (user, system, admin, etc.)
  severity?: "low" | "medium" | "high";  // Severity level
  metadata?: Record<string, unknown>;    // Additional metadata
}

export const recordActivityLog = async (params: ActivityLogParams) => {
  try {
    console.log("🔄 [ACTIVITY LOG] Recording:", params.action);
    
    // Validate required fields
    if (!params.userId) {
      throw new Error("userId is required");
    }
    
    if (!params.action) {
      throw new Error("action is required");
    }

    // Check Firebase connection
    if (!db) {
      throw new Error("Firebase database not initialized");
    }

    const logData = {
      action: params.action,
      details: params.details || '',
      userId: params.userId,
      userEmail: params.userEmail || '',
      category: params.category || 'general',
      severity: params.severity || 'low',
      metadata: params.metadata || {},
      createdAt: serverTimestamp(),        // Firebase server timestamp
      timestamp: new Date().toISOString(), // ISO timestamp
      logId: `activityLog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` // Changed from __name__ to logId
    };

    console.log("📝 [ACTIVITY LOG] Writing to Firestore:", logData);

    const docRef = await addDoc(collection(db, "activityLogs"), logData);
    
    console.log("✅ [ACTIVITY LOG] Success! Document ID:", docRef.id);
    return docRef;
    
  } catch (error) {
    console.error("❌ [ACTIVITY LOG] Error:", error);
    return null;
  }
};