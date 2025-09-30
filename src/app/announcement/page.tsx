"use client";

import { useState, useEffect, useCallback } from "react";
import { db } from "@/app/Firebase/firebase";
import { collection, getDocs, addDoc, query, orderBy, Timestamp, updateDoc, doc, deleteDoc, where } from "firebase/firestore";
import { User, getAuth } from "firebase/auth";
import Image from "next/image";
import Navbar from "../Components/Navbar";
import RequireAuth from "@/app/Components/RequireAuth";
import { recordActivityLog } from '../Components/recordActivityLog';

interface Announcement {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  createdAt: Timestamp;
  archived: boolean;
  body: string;
  ageGroup: string;
  barangay: string;
  youthClassification: string;
  endDate?: string;
  barangays?: string[];
  youthClassifications?: string[];
  isArchived?: boolean;
}

type FilterStatus = "all-active" | "week" | "monthly" | "all-archived";

const auth = getAuth();

export default function AnnouncementPage() {
  return (
    <RequireAuth>
      {(user) => <AnnouncementContent user={user} />}
    </RequireAuth>
  );
}

function AnnouncementContent({ user }: { user: User }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all-active");
  const [currentPage, setCurrentPage] = useState(1);
  const [userDocId, setUserDocId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setAuthUser] = useState<User | null>(null);
  
  const itemsPerPage = 8;

  // Simple authentication and activity logging - INTEGRATED
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setAuthUser(currentUser);

        try {
          // Log page access with specific page name
          await recordActivityLog({
            action: "View Page",
            details: "User accessed the Announcements page",
            userId: currentUser.uid,
            userEmail: currentUser.email || undefined,
            category: "user", // Changed to admin since this appears to be an admin page
          });
          console.log('✅ Page visit logged for Announcements page');
        } catch (error) {
          console.error('❌ Error logging page visit:', error);
        }
      } else {
        setAuthUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Get user document ID
  const getUserDocId = useCallback(async () => {
    try {
      const adminUsersRef = collection(db, 'adminUsers');
      const q = query(adminUsersRef, where('uid', '==', user.uid));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        setUserDocId(querySnapshot.docs[0].id);
      }
    } catch (error) {
      console.error('Error getting user doc ID:', error);
    }
  }, [user.uid]);

  // Initialize user data - SIMPLIFIED (removed duplicate activity logging)
  useEffect(() => {
    const initializeUser = async () => {
      try {
        await getUserDocId();
      } catch (error) {
        console.error('Error initializing user:', error);
        setError('Failed to initialize user data');
      }
    };

    initializeUser();
  }, [user.uid, getUserDocId]);

  // Create notification helper
  const createNotification = useCallback(async (title: string, body: string, type: string, announcementId?: string) => {
    if (userDocId) {
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: userDocId,
          title,
          body,
          type,
          createdAt: Timestamp.now(),
          read: false,
          ...(announcementId && { announcementId })
        });
      } catch (error) {
        console.error('Error creating notification:', error);
      }
    }
  }, [userDocId]);

  const fetchAnnouncements = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const announcementsRef = collection(db, 'announcements');
      const q = query(announcementsRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);

      const fetchedAnnouncements: Announcement[] = [];
      const currentDate = new Date();
      const oneMonthAgo = new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      for (const docSnap of querySnapshot.docs) {
        const data = docSnap.data();
        const createdAt = data.createdAt?.toDate();

        let archived = data.archived || data.isArchived || false;
        
        // Check if announcement has expired based on endDate
        if (data.endDate && !archived) {
          const endDate = new Date(data.endDate);
          if (currentDate > endDate) {
            archived = true;
            await updateDoc(doc(db, 'announcements', docSnap.id), { 
              archived: true, 
              isArchived: true 
            });
            
            // Create notification for auto-archiving
            await createNotification(
              'Announcement Auto-Archived',
              `Announcement "${data.title}" was automatically archived due to expiration`,
              'auto_archive',
              docSnap.id
            );
          }
        }
        
        // Legacy: Auto-archive old announcements without endDate
        if (createdAt && createdAt < oneMonthAgo && !archived && !data.endDate) {
          archived = true;
          await updateDoc(doc(db, 'announcements', docSnap.id), { 
            archived: true, 
            isArchived: true 
          });
          
          // Create notification for legacy auto-archiving
          await createNotification(
            'Legacy Announcement Archived',
            `Legacy announcement "${data.title}" was automatically archived (over 30 days old)`,
            'legacy_archive',
            docSnap.id
          );
        }

        fetchedAnnouncements.push({
          id: docSnap.id,
          title: data.title || '',
          description: data.description || data.body || '',
          imageUrl: data.imageUrl,
          body: data.body || data.description || '',
          createdAt: data.createdAt as Timestamp,
          archived,
          ageGroup: data.ageGroup || 'All',
          barangay: data.barangay || 'All',
          youthClassification: data.youthClassification || 'All',
          endDate: data.endDate,
          barangays: data.barangays,
          youthClassifications: data.youthClassifications,
          isArchived: archived,
        });
      }

      setAnnouncements(fetchedAnnouncements);

      // Log successful fetch (keeping existing detailed logging)
      await recordActivityLog({
        action: 'Fetch Announcements',
        details: `Successfully loaded ${fetchedAnnouncements.length} announcements`,
        userId: user.uid,
        userEmail: user.email || undefined,
        category: 'announcements'
      });

    } catch (error) {
      console.error('Error fetching announcements:', error);
      setError('Failed to load announcements. Please try again.');
      
      // Create error notification
      await createNotification(
        'Error Loading Announcements',
        'Failed to load announcements. Please refresh the page.',
        'fetch_error'
      );
      
      // Log error
      await recordActivityLog({
        action: 'Fetch Announcements Error',
        details: `Failed to load announcements: ${error}`,
        userId: user.uid,
        userEmail: user.email || undefined,
        category: 'announcements',
        severity: 'medium'
      });
    } finally {
      setLoading(false);
    }
  }, [user.uid, user.email, createNotification]);

  // Fetch announcements on mount and when userDocId changes
  useEffect(() => {
    if (userDocId) {
      fetchAnnouncements();
    }
  }, [userDocId, fetchAnnouncements]);

  const getFilteredAnnouncements = useCallback(() => {
    const currentDate = new Date();
    const oneWeekAgo = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    return announcements.filter((announcement) => {
      const createdAt = announcement.createdAt.toDate();

      switch (filterStatus) {
        case "all-active":
          return !announcement.archived && !announcement.isArchived;
        case "week":
          return (!announcement.archived && !announcement.isArchived) && createdAt >= oneWeekAgo;
        case "monthly":
          return (!announcement.archived && !announcement.isArchived) && createdAt >= oneMonthAgo;
        case "all-archived":
          return announcement.archived || announcement.isArchived;
        default:
          return true;
      }
    });
  }, [announcements, filterStatus]);

  const filteredAnnouncements = getFilteredAnnouncements();
  const displayedAnnouncements = filteredAnnouncements.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      const announcementToDelete = announcements.find(a => a.id === id);
      const confirmDelete = window.confirm("Are you sure you want to delete this announcement?");
      
      if (confirmDelete) {
        await deleteDoc(doc(db, "announcements", id));
        setAnnouncements(prevAnnouncements => prevAnnouncements.filter(announcement => announcement.id !== id));
        
        // Create deletion notification
        if (announcementToDelete) {
          await createNotification(
            'Announcement Deleted',
            `Successfully deleted announcement: "${announcementToDelete.title}"`,
            'announcement_deleted',
            id
          );
        }
        
        // Log deletion
        await recordActivityLog({
          action: 'Delete Announcement',
          details: `Deleted announcement: ${announcementToDelete?.title}`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'announcements',
          severity: 'medium'
        });
      }
    } catch (error) {
      console.error("Error deleting announcement:", error);
      
      // Create error notification
      await createNotification(
        'Delete Error',
        'Failed to delete announcement. Please try again.',
        'delete_error'
      );
      
      // Log error
      await recordActivityLog({
        action: 'Delete Announcement Error',
        details: `Failed to delete announcement: ${error}`,
        userId: user.uid,
        userEmail: user.email || undefined,
        category: 'announcements',
        severity: 'high'
      });
    }
  };

  const handleFilterChange = async (newFilter: FilterStatus) => {
    setFilterStatus(newFilter);
    setCurrentPage(1); // Reset to first page when filter changes
    
    // Log filter change
    await recordActivityLog({
      action: 'Filter Announcements',
      details: `Changed filter to: ${newFilter}`,
      userId: user.uid,
      userEmail: user.email || undefined,
      category: 'announcements'
    });
  };

  const handleAnnouncementClick = async (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setIsModalOpen(true);
    
    // Log announcement view
    await recordActivityLog({
      action: 'View Announcement Details',
      details: `Viewed announcement: ${announcement.title}`,
      userId: user.uid,
      userEmail: user.email || undefined,
      category: 'announcements'
    });
  };

  const totalPages = Math.ceil(filteredAnnouncements.length / itemsPerPage);

  if (loading) {
    return (
      <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-[#1167B1] mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold text-[#1167B1]">Loading Announcements...</h2>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">{error}</h2>
          <button
            onClick={() => fetchAnnouncements()}
            className="bg-[#1167B1] hover:bg-[#0d4c8b] text-white px-6 py-2 rounded-md"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] flex flex-col gap-8 overflow-auto">
      <Navbar />
      
      {/* Header Section */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-semibold text-black">Announcements</h1>
          <p className="text-lg text-gray-700 mt-1">
            The central hub for sending important announcements and updates ensuring the community stays informed.
          </p>
        </div>
      </div>

      {/* Main Announcements Section */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-1 flex flex-col gap-8">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-semibold text-black">List of Announcements</h2>
          <FilterDropdown 
            filterStatus={filterStatus} 
            onFilterChange={handleFilterChange} 
          />
        </div>

        {/* Announcements Grid */}
        <AnnouncementsGrid 
          announcements={displayedAnnouncements}
          onAnnouncementClick={handleAnnouncementClick}
          onDeleteAnnouncement={handleDeleteAnnouncement}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <PaginationControls 
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        )}

        {/* Empty State */}
        {displayedAnnouncements.length === 0 && (
          <EmptyState />
        )}
      </div>

      {/* Announcement Details Modal */}
      {isModalOpen && selectedAnnouncement && (
        <AnnouncementModal
          announcement={selectedAnnouncement}
          onClose={() => setIsModalOpen(false)}
        />
      )}

      {/* Floating Action Button */}
      <FloatingActionButton />
    </div>
  );
}

// Filter Dropdown Component
function FilterDropdown({ 
  filterStatus, 
  onFilterChange 
}: { 
  filterStatus: FilterStatus; 
  onFilterChange: (filter: FilterStatus) => void; 
}) {
  return (
    <div className="relative">
      <select
        value={filterStatus}
        onChange={(e) => onFilterChange(e.target.value as FilterStatus)}
        className="bg-[#2563eb] text-white px-4 py-2 rounded-lg border-none outline-none cursor-pointer appearance-none pr-8"
      >
        <option value="all-active">Status: All Active</option>
        <option value="week">Status: This Week</option>
        <option value="monthly">Status: This Month</option>
        <option value="all-archived">Status: All Archived</option>
      </select>
      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}

// Announcements Grid Component
function AnnouncementsGrid({ 
  announcements, 
  onAnnouncementClick, 
  onDeleteAnnouncement 
}: {
  announcements: Announcement[];
  onAnnouncementClick: (announcement: Announcement) => void;
  onDeleteAnnouncement: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {announcements.map((announcement) => (
        <div
          key={announcement.id}
          className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow cursor-pointer border"
          onClick={() => onAnnouncementClick(announcement)}
        >
          {announcement.imageUrl && (
            <div className="relative h-48 w-full">
              <Image
                src={announcement.imageUrl}
                alt={announcement.title}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
              />
            </div>
          )}
          <div className="p-4">
            <h3 className="font-semibold text-lg text-black mb-2 line-clamp-2">{announcement.title}</h3>
            <p className="text-gray-600 text-sm line-clamp-3">{announcement.description}</p>
            <div className="mt-3 flex justify-between items-center">
              <span className="text-xs text-gray-500">
                {announcement.createdAt.toDate().toLocaleDateString()}
              </span>
              <div className="flex items-center space-x-2">
                {(announcement.archived || announcement.isArchived) && (
                  <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">Archived</span>
                )}
                {announcement.endDate && (
                  <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                    Until {new Date(announcement.endDate).toLocaleDateString()}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteAnnouncement(announcement.id);
                  }}
                  className="bg-red-500 text-white text-xs px-2 py-1 rounded-full hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Pagination Controls Component
function PaginationControls({ 
  currentPage, 
  totalPages, 
  onPageChange 
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex justify-center items-center mt-4 space-x-2">
      <button
        className={`px-4 py-2 text-white rounded-md transition-colors ${
          currentPage === 1 ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#1167B1] hover:bg-[#0A4F9E]'
        }`}
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        Previous
      </button>

      <div className="flex gap-2">
        {[...Array(totalPages)].map((_, index) => (
          <button
            key={index}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              currentPage === index + 1 
                ? 'bg-[#1167B1] text-white' 
                : 'bg-white text-[#1167B1] border border-[#1167B1] hover:bg-[#EFF8FF]'
            }`}
            onClick={() => onPageChange(index + 1)}
          >
            {index + 1}
          </button>
        ))}
      </div>

      <button
        className={`px-4 py-2 text-white rounded-md transition-colors ${
          currentPage === totalPages ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#1167B1] hover:bg-[#0A4F9E]'
        }`}
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        Next
      </button>
    </div>
  );
}

// Empty State Component
function EmptyState() {
  return (
    <div className="text-center py-12">
      <div className="mb-4">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">No announcements found</h3>
      <p className="text-gray-500">No announcements match the selected filter criteria.</p>
    </div>
  );
}

// Floating Action Button Component
function FloatingActionButton() {
  return (
    <div className="fixed bottom-8 right-8">
      <a
        href="/announcement/createannouncement"
        aria-label="Create Announcement"
        className="flex items-center justify-center w-16 h-16 bg-[#08326A] text-white rounded-full shadow-2xl border-4 border-white hover:bg-[#0a3f85] transition-colors"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
        </svg>
      </a>
    </div>
  );
}

// Announcement Modal Component
function AnnouncementModal({ 
  announcement, 
  onClose 
}: { 
  announcement: Announcement; 
  onClose: () => void; 
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <h3 className="text-2xl font-semibold text-[#1167B1]">{announcement.title}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Image */}
        {announcement.imageUrl && (
          <div className="relative w-full mb-6">
            <Image
              src={announcement.imageUrl}
              alt={announcement.title}
              width={800}
              height={400}
              className="w-full h-auto max-h-[400px] object-contain mx-auto rounded-lg"
            />
          </div>
        )}

        {/* Content */}
        <div className="mb-6">
          <h4 className="font-semibold text-lg mb-2">Description</h4>
          <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{announcement.body}</p>
        </div>

        {/* Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <h5 className="font-semibold text-black mb-2">Announcement Details</h5>
            <div className="space-y-2 text-sm">
              <p><strong>Created:</strong> {announcement.createdAt.toDate().toLocaleDateString()}</p>
              {announcement.endDate && (
                <p><strong>Expires:</strong> {new Date(announcement.endDate).toLocaleDateString()}</p>
              )}
              <p><strong>Status:</strong> 
                <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                  (announcement.archived || announcement.isArchived) 
                    ? 'bg-red-100 text-red-800' 
                    : 'bg-green-100 text-green-800'
                }`}>
                  {(announcement.archived || announcement.isArchived) ? 'Archived' : 'Active'}
                </span>
              </p>
            </div>
          </div>

          <div>
            <h5 className="font-semibold text-black mb-2">Target Audience</h5>
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium">Barangays:</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {announcement.barangays && announcement.barangays.length > 0 ? 
                    announcement.barangays.map((barangay, index) => (
                      <span key={index} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                        {barangay}
                      </span>
                    )) : 
                    <span className="text-gray-500 text-xs">All Barangays</span>
                  }
                </div>
              </div>
              
              <div>
                <p className="font-medium">Youth Classifications:</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {announcement.youthClassifications && announcement.youthClassifications.length > 0 ? 
                    announcement.youthClassifications.map((classification, index) => (
                      <span key={index} className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                        {classification}
                      </span>
                    )) : 
                    <span className="text-gray-500 text-xs">All Classifications</span>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end">
          <button
            className="px-6 py-2 bg-[#1167B1] text-white rounded-md hover:bg-[#0d4c8b] transition-colors"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
