'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { collection, getDocs, query, orderBy, where, limit, Timestamp } from 'firebase/firestore';
import { getAuth, User } from 'firebase/auth';
import { db } from '@/app/Firebase/firebase';
import Navbar from '../../Components/Navbar';

interface ActivityLogData {
  id: string;
  action: string;
  details?: string;
  userId: string;
  userEmail?: string;
  category: string;
  timestamp: Timestamp; // Firestore timestamp
  date: string;
  time: string;
}

const ActivityLogPage = () => {
  const [logs, setLogs] = useState<ActivityLogData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Get current user
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Fetch activity logs
  useEffect(() => {
    const fetchActivityLogs = async () => {
      if (!user) return;
      
      setLoading(true);
      try {
        const activityLogsRef = collection(db, 'activityLogs');
        
        // Create query to get user's activity logs
        const q = query(
          activityLogsRef,
          where('userId', '==', user.uid),
          where('category', '==', 'user'),
          orderBy('timestamp', 'desc'),
          limit(50) // Limit to recent 50 logs
        );

        const querySnapshot = await getDocs(q);
        const fetchedLogs: ActivityLogData[] = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          fetchedLogs.push({
            id: doc.id,
            ...data,
          } as ActivityLogData);
        });

        setLogs(fetchedLogs);
      } catch (err) {
        console.error('Error fetching activity logs:', err);
        setError('Failed to load activity logs');
      } finally {
        setLoading(false);
      }
    };

    fetchActivityLogs();
  }, [user]);

  // Format timestamp for display
  const formatTimestamp = (timestamp: Timestamp | Date | { seconds: number } | null) => {
    if (!timestamp) return { date: 'Unknown', time: 'Unknown' };
    
    let date: Date;
    if (timestamp instanceof Date) {
      // Already a Date object
      date = timestamp;
    } else if (typeof timestamp === 'object' && 'toDate' in timestamp && typeof timestamp.toDate === 'function') {
      // Firestore Timestamp
      date = timestamp.toDate();
    } else if (typeof timestamp === 'object' && 'seconds' in timestamp) {
      // Timestamp object with seconds
      date = new Date(timestamp.seconds * 1000);
    } else {
      // Fallback to creating a Date directly (should not happen)
      date = new Date(timestamp as string | number);
    }

    const dateStr = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const timeStr = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    return { date: dateStr, time: timeStr };
  };

  // Group logs by date
  const groupLogsByDate = (logs: ActivityLogData[]) => {
    const grouped: { [key: string]: ActivityLogData[] } = {};
    
    logs.forEach(log => {
      const { date } = formatTimestamp(log.timestamp);
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(log);
    });

    return grouped;
  };

  const groupedLogs = groupLogsByDate(logs);

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
      {/* Greeting Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-700">Kamusta!</h2>
          <h1 className="text-3xl font-bold text-[#1167B1]">Kabataan ng Marikina</h1>
        </div>
      </div>

      {/* Activity Log Section */}
      <div className="w-full bg-white rounded-xl shadow-md">
        {/* Blue Header */}
        <div className="relative bg-[#1167B1] text-white px-6 py-4 rounded-t-xl flex items-center justify-between">
          <Link href="/user">
            <button className="absolute left-6 top-1/2 -translate-y-1/2 text-xl hover:opacity-80">
              ←
            </button>
          </Link>
          <h2 className="text-center text-3xl font-semibold flex-1">Activity Log</h2>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1167B1]"></div>
              <p className="ml-3 text-gray-600">Loading activity logs...</p>
            </div>
          )}
          
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
              <p className="text-red-600">Error: {error}</p>
            </div>
          )}
          
          {!loading && !error && logs.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium">No activity logs found</p>
              <p className="text-sm text-gray-400">Your activity will appear here as you use the system</p>
            </div>
          )}

          {/* Activity Logs Grouped by Date */}
          {!loading && !error && Object.entries(groupedLogs).map(([date, dateLogs]) => (
            <div key={date} className="mb-6">
              <div className="sticky top-0 bg-gray-50 px-4 py-2 rounded-md mb-3">
                <h3 className="text-sm font-semibold text-gray-600">{date}</h3>
              </div>
              
              <div className="space-y-3">
                {dateLogs.map((log) => {
                  const { time } = formatTimestamp(log.timestamp);
                  return (
                    <div key={log.id} className="border-l-4 border-[#1167B1] bg-gray-50 p-4 rounded-r-md hover:bg-gray-100 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#1167B1] text-white">
                              {log.action}
                            </span>
                            <span className="text-xs text-gray-500">{time}</span>
                          </div>
                          
                          {log.details && (
                            <p className="text-sm text-gray-700 mt-1">{log.details}</p>
                          )}
                          
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span>User: {log.userEmail || 'Unknown'}</span>
                            <span>Category: {log.category}</span>
                          </div>
                        </div>
                        
                        <div className="ml-4">
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          
          {/* Load More Button (if needed) */}
          {logs.length >= 50 && (
            <div className="text-center mt-6">
              <button className="px-6 py-2 bg-[#1167B1] text-white rounded-md hover:bg-[#0e5290] transition-colors">
                Load More
              </button>
            </div>
          )}
        </div>
      </div>

      <Navbar />
    </div>
  );
};

export default ActivityLogPage;
