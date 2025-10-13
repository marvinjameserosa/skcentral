"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import { db, storage } from "@/app/Firebase/firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { getAuth, type User } from "firebase/auth";
import Navbar from "../Components/Navbar";
import RequireAuth from "@/app/Components/RequireAuth";
import { recordActivityLog } from "@/app/Components/recordActivityLog"; 
interface FormData {
  title: string;
  desc: string;
  company: string;
  companyEmail: string;
  eligibility: string;
  deadline: string;
  location: string;
  img: string;
  createdAt?: Timestamp;
}

interface FormErrors {
  [key: string]: string;
}

interface LoadingStates {
  fetching: boolean;
  publishing: boolean;
  saving: boolean;
  deleting: boolean;
  archiving: boolean;
}


interface ScholarshipType {
  id: string;
  title: string;
  desc: string;
  company: string;
  companyEmail: string;
  eligibility: string;
  deadline: string;
  location: string;
  img: string;
  scholarshipId: string;
  createdAt?: Timestamp | Date | string | import("firebase/firestore").FieldValue;
  status?: 'active' | 'expired' | 'archived';
}

const DEFAULT_FORM_VALUES: FormData = {
  title: "",
  desc: "",
  company: "",
  companyEmail: "",
  eligibility: "",
  deadline: "",
  location: "",
  img: "",
};

export default function ScholarshipListing() {
  // File and UI state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  
  // Data state
  const [scholarshipListings, setScholarshipListings] = useState<ScholarshipType[]>([]);
  const [archivedScholarships, setArchivedScholarships] = useState<ScholarshipType[]>([]);
  
  // Filter and search state
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired' | 'archived'>('active');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'deadline'>('newest');
  
  // Form state
  const [form, setForm] = useState<FormData>({ ...DEFAULT_FORM_VALUES });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isEditing, setIsEditing] = useState<boolean>(false);
  
  // Modal state
  const [showConfirmationModal, setShowConfirmationModal] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [actionType, setActionType] = useState<'publish' | 'save' | 'delete' | 'archive' | null>(null);
  const [modalScholarshipId, setModalScholarshipId] = useState<string | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string>("");
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(8);
  
  // User state
  const [user, setUser] = useState<User | null>(null);
  const [] = useState<string>("");
  
  // Loading state
  const [loadingStates, setLoadingStates] = useState<LoadingStates>({
    fetching: false,
    publishing: false,
    saving: false,
    deleting: false,
    archiving: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Authentication and user setup
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        // Log page access with specific page name
        await recordActivityLog({
          action: "View Page",
          details: "User accessed the Scholarship Listing page", // Specific page name added here
          userId: currentUser.uid,
          userEmail: currentUser.email || undefined,
          category: "user",
        });
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Utility functions
  const updateLoadingState = useCallback((key: keyof LoadingStates, value: boolean) => {
    setLoadingStates((prev) => ({ ...prev, [key]: value }));
  }, []);

  const showNotification = useCallback((message: string, type: 'success' | 'error' = "success") => {
    console.log(`Notification type: ${type}`);
    setConfirmMessage(message);
    setShowSuccessModal(true);
  }, []);

  const validateForm = useCallback((): FormErrors => {
    const errors: FormErrors = {};
    if (!form.title.trim()) errors.title = "Title is required";
    if (!form.desc.trim()) errors.desc = "Description is required";
    if (!form.company.trim()) errors.company = "Company name is required";
    if (!form.companyEmail.trim()) {
      errors.companyEmail = "Company email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.companyEmail)) {
      errors.companyEmail = "Invalid email format";
    }
    if (!form.eligibility.trim()) errors.eligibility = "Eligibility criteria is required";
    if (!form.deadline) {
      errors.deadline = "Deadline is required";
    } else if (new Date(form.deadline) < new Date()) {
      errors.deadline = "Deadline cannot be in the past";
    }
    if (!form.location.trim()) errors.location = "Location is required";
    return errors;
  }, [form]);

  const resetForm = useCallback(() => {
    setForm({ ...DEFAULT_FORM_VALUES });
    setSelectedFile(null);
    setPreviewUrl("");
    setFileName("");
    setFormErrors({});
    setIsEditing(false);
    setModalScholarshipId(null);
  }, []);

  // Check if scholarship is expired
  const isExpired = useCallback((deadline: string): boolean => {
    return new Date(deadline) < new Date();
  }, []);

  // Data fetching
  const fetchScholarshipListings = useCallback(async () => {
    updateLoadingState("fetching", true);
    try {
      const q = query(collection(db, "scholarships"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      
      const fetchedScholarships = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          status: isExpired(data.deadline) ? 'expired' : 'active',
        } as ScholarshipType;
      });
      
      setScholarshipListings(fetchedScholarships);

      // Fetch archived scholarships
      const archivedQuery = query(collection(db, "archivedScholarships"), orderBy("createdAt", "desc"));
      const archivedSnapshot = await getDocs(archivedQuery);
      const archivedData = archivedSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        status: 'archived',
      })) as ScholarshipType[];
      
      setArchivedScholarships(archivedData);
    } catch (error) {
      console.error("Error fetching scholarship listings:", error);
      showNotification("Failed to fetch scholarships. Please try again.", "error");
    } finally {
      updateLoadingState("fetching", false);
    }
  }, [showNotification, updateLoadingState, isExpired]);

  useEffect(() => {
    fetchScholarshipListings();
  }, [fetchScholarshipListings]);

  // Filter and sort scholarships
  const processedScholarships = useMemo(() => {
    let allScholarships = [...scholarshipListings];
    
    if (filterStatus === 'archived') {
      allScholarships = archivedScholarships;
    } else if (filterStatus !== 'all') {
      allScholarships = scholarshipListings.filter(scholarship => scholarship.status === filterStatus);
    }

    // Apply search filter
    if (searchTerm) {
      allScholarships = allScholarships.filter(scholarship =>
        scholarship.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        scholarship.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
        scholarship.location.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply sorting
    allScholarships.sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
// Utility to safely get milliseconds from createdAt
function getMillis(val: string | Date | Timestamp | import("firebase/firestore").FieldValue | undefined): number {
  if (!val) return 0;
  if (typeof val === 'string' || val instanceof Date) return new Date(val).getTime();
  if (typeof val === 'object' && 'seconds' in val) return new Date((val as Timestamp).seconds * 1000).getTime();
  return 0;
}

          return getMillis(a.createdAt) - getMillis(b.createdAt);
        case 'deadline':
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        case 'newest':
        default:
          return getMillis(b.createdAt) - getMillis(a.createdAt);
      }
    });

    return allScholarships;
  }, [scholarshipListings, archivedScholarships, searchTerm, filterStatus, sortBy]);

  // Pagination
  const paginatedScholarships = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return processedScholarships.slice(startIndex, startIndex + itemsPerPage);
  }, [processedScholarships, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(processedScholarships.length / itemsPerPage);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, sortBy]);

  // File handling
  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setFileName(file.name);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    
    // Clean up previous preview URL
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'file') {
      const fileInput = e.target as HTMLInputElement;
      const file = fileInput.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    } else {
      setForm(prev => ({
        ...prev,
        [name]: value
      }));
      
      // Clear specific error when user starts typing
      if (formErrors[name]) {
        setFormErrors(prev => ({
          ...prev,
          [name]: ""
        }));
      }
    }
  }, [handleFileSelect, formErrors]);

  // Upload image to storage
  const uploadImage = useCallback(async (file: File): Promise<string> => {
    const storageRef = ref(storage, `scholarships/${Date.now()}_${file.name}`);
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
  }, []);

  // Delete image from storage
  const deleteImage = useCallback(async (imageUrl: string) => {
    try {
      if (imageUrl && imageUrl !== "/testpic.jpg") {
        const imageRef = ref(storage, imageUrl);
        await deleteObject(imageRef);
      }
    } catch (error) {
      console.error("Error deleting image:", error);
    }
  }, []);

  // Send notification to all users
  const sendNotificationToAllUsers = useCallback(async (title: string, body: string, type: string = "scholarship") => {
    try {
      const usersQuery = query(collection(db, "users"));
      const usersSnapshot = await getDocs(usersQuery);
      
      const notificationPromises = usersSnapshot.docs.map(async (userDoc) => {
        const userData = userDoc.data();
        await addDoc(collection(db, "notifications"), {
          userId: userDoc.id,
          userEmail: userData.email,
          title,
          message: body,
          type,
          isRead: false,
          createdAt: serverTimestamp(),
        });
      });

      await Promise.all(notificationPromises);
    } catch (error) {
      console.error("Error sending notification:", error);
    }
  }, []);

  // Form handlers
  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setActionType("publish");
    setConfirmMessage(isEditing ? "Are you sure you want to update this scholarship?" : "Are you sure you want to publish this scholarship?");
    setShowConfirmationModal(true);
  };

  const executePublish = async () => {
    updateLoadingState("publishing", true);
    try {
      let imageUrl = "/testpic.jpg";
      if (selectedFile) {
        imageUrl = await uploadImage(selectedFile);
      } else if (isEditing && form.img) {
        imageUrl = form.img;
      }

      const scholarshipData = {
        ...form,
        img: imageUrl,
        createdAt: isEditing ? form.createdAt || serverTimestamp() : serverTimestamp(),
        status: "active" as const,
      };

      if (isEditing && modalScholarshipId) {
        // Update existing scholarship
        await updateDoc(doc(db, "scholarships", modalScholarshipId), scholarshipData);
        
        setScholarshipListings(prev =>
          prev.map(scholarship =>
            scholarship.id === modalScholarshipId
              ? ({ ...scholarshipData, id: modalScholarshipId, scholarshipId: modalScholarshipId } as ScholarshipType)
              : scholarship
          )
        );

        // Send notification for update
        await sendNotificationToAllUsers(
          "Scholarship Updated",
          `The scholarship "${form.title}" by ${form.company} has been updated.`,
          "scholarship"
        );

        // Log activity
        if (user) {
          await recordActivityLog({
            action: "Update Scholarship",
            details: `Updated scholarship: ${form.title}`,
            userId: user.uid,
            userEmail: user.email || undefined,
            category: "admin",
          });
        }

        showNotification("Scholarship updated successfully!");
      } else {
        // Create new scholarship
        const docRef = await addDoc(collection(db, "scholarships"), scholarshipData);
        await updateDoc(docRef, { scholarshipId: docRef.id });
        
        setScholarshipListings(prev => [
          { ...scholarshipData, id: docRef.id, scholarshipId: docRef.id } as ScholarshipType,
          ...prev
        ]);
        
        // Send notification to all users
        await sendNotificationToAllUsers(
          "New Scholarship Posted",
          `A new scholarship "${form.title}" has been posted by ${form.company}. Apply now!`,
          "scholarship"
        );

        // Log activity
        if (user) {
          await recordActivityLog({
            action: "Create Scholarship",
            details: `Published new scholarship: ${form.title}`,
            userId: user.uid,
            userEmail: user.email || undefined,
            category: "admin",
          });
        }

        showNotification("Scholarship published successfully!");
      }

      resetForm();
    } catch (error) {
      console.error("Error publishing scholarship:", error);
      showNotification("Failed to publish scholarship. Please try again.", "error");
    } finally {
      updateLoadingState("publishing", false);
      setShowConfirmationModal(false);
    }
  };

  // Delete scholarship
  const executeDelete = async () => {
    if (!modalScholarshipId) return;

    updateLoadingState('deleting', true);
    try {
      const scholarship = scholarshipListings.find(s => s.id === modalScholarshipId);
      if (scholarship?.img) {
        await deleteImage(scholarship.img);
      }

      await deleteDoc(doc(db, "scholarships", modalScholarshipId));
      setScholarshipListings(prev => prev.filter(s => s.id !== modalScholarshipId));

      // Log activity
      if (user && scholarship) {
        await recordActivityLog({
          action: "Delete Scholarship",
          details: `Deleted scholarship: ${scholarship.title}`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: "admin",
        });
      }

      setModalScholarshipId(null);
      showNotification("Scholarship deleted successfully!");
    } catch (error) {
      console.error("Error deleting scholarship:", error);
      showNotification("Failed to delete scholarship. Please try again.", "error");
    } finally {
      updateLoadingState('deleting', false);
      setShowConfirmationModal(false);
    }
  };

  // Archive scholarship
  const executeArchive = async () => {
    if (!modalScholarshipId) return;

    updateLoadingState('archiving', true);
    try {
      const scholarshipRef = doc(db, "scholarships", modalScholarshipId);
      const scholarshipSnap = await getDoc(scholarshipRef);

      if (scholarshipSnap.exists()) {
        const scholarshipData = scholarshipSnap.data();
        await setDoc(doc(db, "archivedScholarships", modalScholarshipId), {
          ...scholarshipData,
          archivedAt: serverTimestamp(),
        });

        await deleteDoc(scholarshipRef);
        setScholarshipListings(prev => prev.filter(s => s.id !== modalScholarshipId));

        // Log activity
        if (user) {
          await recordActivityLog({
            action: "Archive Scholarship",
            details: `Archived scholarship: ${scholarshipData.title}`,
            userId: user.uid,
            userEmail: user.email || undefined,
            category: "admin",
          });
        }

        showNotification("Scholarship archived successfully!");
      }
    } catch (error) {
      console.error("Error archiving scholarship:", error);
      showNotification("Failed to archive scholarship. Please try again.", "error");
    } finally {
      updateLoadingState('archiving', false);
      setShowConfirmationModal(false);
      setModalScholarshipId(null);
    }
  };

  // Handle modal confirmation
  const handleConfirmAction = async () => {
    switch (actionType) {
      case "publish":
        await executePublish();
        break;
      case "delete":
        await executeDelete();
        break;
      case "archive":
        await executeArchive();
        break;
      default:
        setShowConfirmationModal(false);
    }
  };

  // Handle delete action
  const handleDelete = () => {
    if (!modalScholarshipId) return;
    setActionType("delete");
    setConfirmMessage("Are you sure you want to delete this scholarship? This action cannot be undone.");
    setShowConfirmationModal(true);
  };

  // Handle archive action
  const handleArchive = (scholarshipId: string) => {
    setActionType("archive");
    setConfirmMessage("Are you sure you want to archive this scholarship? It will be moved to archived section.");
    setShowConfirmationModal(true);
    setModalScholarshipId(scholarshipId);
  };

  // Render form field with error
  const renderFormField = (
    id: keyof FormData,
    label: string,
    type: string = "text",
    required: boolean = true,
    placeholder?: string,
    component?: "input" | "textarea"
  ) => (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {component === "textarea" ? (
        <textarea
          id={id}
          name={id}
          required={required}
          placeholder={placeholder}
          rows={3}
          className={`w-full bg-blue-100 p-2 rounded resize-none border ${
            formErrors[id] ? 'border-red-500' : 'border-transparent'
          }`}
          value={form[id] as string}
          onChange={handleChange}
          disabled={modalScholarshipId ? !isEditing : false}
        />
      ) : (
        <input
          id={id}
          name={id}
          type={type}
          required={required}
          placeholder={placeholder}
          className={`w-full bg-blue-100 p-2 rounded border ${
            formErrors[id] ? 'border-red-500' : 'border-transparent'
          }`}
          value={form[id] as string}
          onChange={handleChange}
          disabled={modalScholarshipId ? !isEditing : false}
        />
      )}
      {formErrors[id] && (
        <p className="text-red-500 text-xs mt-1">{formErrors[id]}</p>
      )}
    </div>
  );

  return (
    <RequireAuth>
      <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa]">
        {/* Header */}
        <div className="mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-semibold text-gray-800">Scholarship Listing</h1>
              <p className="text-lg text-gray-600 mt-1">
                The hub that connects kabataan with scholarship opportunities.
              </p>
            </div>
          </div>
        </div>

        {/* Post Scholarship Form */}
        {!modalScholarshipId && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-8 mt-4">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Post New Scholarship</h2>
            <form onSubmit={handlePublishSubmit} className="space-y-4">
              {renderFormField("title", "Scholarship Title", "text", true, "e.g., Academic Excellence Scholarship")}
              {renderFormField("desc", "Description", "text", true, "Describe the scholarship program", "textarea")}

              <div className="flex gap-3 w-full">
                <div className="w-full">
                  {renderFormField("company", "Organization", "text", true, "Organization Name")}
                </div>
                <div className="w-full">
                  {renderFormField("companyEmail", "Contact Email", "email", true, "info@organization.com")}
                </div>
              </div>

              <div className="flex gap-3 w-full">
                <div className="w-full">
                  {renderFormField("eligibility", "Eligibility", "text", true, "e.g., Grade 12 students with 90+ average")}
                </div>
                <div className="w-full">
                  {renderFormField("deadline", "Application Deadline", "date", true)}
                </div>
              </div>

              <div className="w-full">
                {renderFormField("location", "Location", "text", true, "e.g., Nationwide, Metro Manila")}
              </div>

              <div>
                <label htmlFor="img" className="block text-sm font-semibold text-gray-700 mb-1">
                  Picture
                </label>
                <div className="w-full border border-gray-300 rounded-md h-10 flex items-center overflow-hidden">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-[#DBEAFE] px-5 h-full text-sm font-medium text-gray-700 hover:bg-[#C5D8F1] flex-shrink-0 transition-colors"
                  >
                    Choose File
                  </button>
                  <span className="text-sm text-gray-600 px-3 truncate w-full text-left">
                    {fileName || "No file chosen"}
                  </span>
                  <input
                    type="file"
                    id="img"
                    name="img"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleChange}
                    accept="image/*"
                  />
                </div>
                {previewUrl && (
                  <div className="mt-2">
                    <Image
                      src={previewUrl}
                      alt={`Preview of the scholarship image for ${form.title || "Scholarship"}`} // Added descriptive alt text
                      width={100}
                      height={100}
                      className="rounded border"
                      unoptimized
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-4 mt-6">
                <button
                  type="button"
                  onClick={resetForm}
                  className="bg-gray-300 text-gray-800 px-6 py-2 rounded hover:bg-gray-400 transition-colors"
                >
                  Reset
                </button>
                <button
                  type="submit"
                  disabled={loadingStates.publishing}
                  className="bg-[#1167B1] text-white px-6 py-2 rounded hover:bg-[#0A4F9E] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loadingStates.publishing ? "Publishing..." : "Publish"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filters and Search */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex flex-wrap gap-4 items-center">
              <div>
                <input
                  type="text"
                  placeholder="Search scholarships..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1167B1]"
                />
              </div>
              <div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'expired' | 'archived')}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1167B1]"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'deadline')}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1167B1]"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="deadline">By Deadline</option>
                </select>
              </div>
            </div>
            <div className="text-sm text-gray-600">
              Showing {paginatedScholarships.length} of {processedScholarships.length} scholarships
            </div>
          </div>
        </div>

        {/* Current Scholarship Listings */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-900">Current Scholarship Listings</h2>
            <a
              href="/scholarship-listing/Scholarship-Listing-Applicants"
              className="bg-[#1167B1] text-white text-sm font-bold py-2 px-4 rounded-md hover:bg-[#0e5290] transition-colors"
            >
              View all Applicants
            </a>
          </div>

          {loadingStates.fetching ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#1167B1]"></div>
              <p className="mt-2 text-gray-600">Loading scholarships...</p>
            </div>
          ) : paginatedScholarships.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchTerm || filterStatus !== 'all' ? "No scholarships match your filters." : "No scholarships found."}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pb-4">
              {paginatedScholarships.map((scholarship) => (
                <div
                  key={scholarship.id}
                  className="bg-white rounded-lg shadow-md transform transition-all duration-300 hover:scale-105 hover:shadow-xl cursor-pointer relative"
                  onClick={() => setModalScholarshipId(scholarship.id)}
                >
                  <div className="absolute top-2 right-2 z-10">
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        scholarship.status === 'expired'
                          ? 'bg-red-100 text-red-800'
                          : scholarship.status === 'archived'
                          ? 'bg-gray-300 text-gray-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {scholarship.status === 'expired'
                        ? 'Expired'
                        : scholarship.status === 'archived'
                        ? 'Archived'
                        : 'Active'}
                    </span>
                  </div>
                  <Image
                    src={scholarship.img || "/testpic.jpg"}
                    alt={`Scholarship image for ${scholarship.title}`} // Added descriptive alt text
                    width={280}
                    height={200}
                    className="rounded-t-lg object-cover w-full h-[200px]"
                    unoptimized
                  />
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 text-lg mb-1 line-clamp-2">
                      {scholarship.title}
                    </h3>
                    <p className="text-sm text-gray-600 mb-1">{scholarship.company}</p>
                    <p className="text-sm text-gray-700 leading-tight line-clamp-3">
                      {scholarship.desc}
                    </p>
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-500">
                        Deadline: {new Date(scholarship.deadline).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        Location: {scholarship.location}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Items per page:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                >
                  <option value={4}>4</option>
                  <option value={8}>8</option>
                  <option value={12}>12</option>
                  <option value={16}>16</option>
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  className={`px-4 py-2 text-white rounded-md transition-colors ${
                    currentPage === 1
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-[#1167B1] hover:bg-[#0A4F9E]'
                  }`}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>

                <div className="flex gap-1">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        className={`px-3 py-2 text-sm rounded-md transition-colors ${
                          currentPage === pageNum
                            ? 'bg-[#1167B1] text-white'
                            : 'bg-white text-[#1167B1] border border-[#1167B1] hover:bg-[#EFF8FF]'
                        }`}
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  className={`px-4 py-2 text-white rounded-md transition-colors ${
                    currentPage === totalPages
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-[#1167B1] hover:bg-[#0A4F9E]'
                  }`}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal for Scholarship Details */}
        {modalScholarshipId && (
          <div className="fixed inset-0 bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#e7f0fa] rounded-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto p-6 text-left shadow-xl border-2 border-[#0A2F7A] relative">
              <button
                onClick={() => {
                  setModalScholarshipId(null);
                  setIsEditing(false);
                  resetForm();
                }}
                className="absolute top-4 right-4 w-8 h-8 bg-red-600 text-white text-xl font-bold rounded-full hover:bg-red-700 transition-colors z-10"
              >
                ×
              </button>

              {scholarshipListings.find(scholarship => scholarship.id === modalScholarshipId) && (
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Image Section */}
                  <div className="lg:w-[420px] flex-shrink-0 flex flex-col items-center">
                    <div className="relative">
                      <Image
                        src={previewUrl || form.img || "/testpic.jpg"}
                        alt={`Scholarship image for ${form.title || "Scholarship"}`} // Added descriptive alt text
                        width={420}
                        height={420}
                        className="w-full lg:w-[420px] h-[300px] lg:h-[420px] object-cover rounded-lg border-2 border-[#1167B1]"
                        unoptimized
                      />
                      <div className="absolute top-2 left-2">
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            isExpired(form.deadline)
                              ? 'bg-red-100 text-red-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {isExpired(form.deadline) ? 'Expired' : 'Active'}
                        </span>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="mt-4 w-full">
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Change Picture
                        </label>
                        <div className="border border-gray-300 rounded-md h-10 flex items-center overflow-hidden">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-[#DBEAFE] px-4 h-full text-sm font-medium text-gray-700 hover:bg-[#C5D8F1] flex-shrink-0 transition-colors"
                          >
                            Choose File
                          </button>
                          <span className="text-sm text-gray-600 px-3 truncate w-full text-left">
                            {fileName || "No file chosen"}
                          </span>
                          <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleChange}
                            accept="image/*"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Form Section */}
                  <div className="flex-grow space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="lg:col-span-2">
                        {renderFormField("title", "Scholarship Title")}
                      </div>

                      <div className="lg:col-span-2">
                        {renderFormField("desc", "Description", "text", true, "Enter description", "textarea")}
                      </div>

                      {renderFormField("company", "Organization")}
                      {renderFormField("companyEmail", "Contact Email", "email")}
                      {renderFormField("eligibility", "Eligibility")}
                      {renderFormField("location", "Location")}
                      {renderFormField("deadline", "Application Deadline", "date")}

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Days Until Deadline
                        </label>
                        <div className="w-full bg-gray-100 p-2 rounded border text-gray-600">
                          {(() => {
                            const daysLeft = Math.ceil((new Date(form.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                            return daysLeft > 0 ? `${daysLeft} days remaining` : 'Expired';
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3 mt-8 pt-6 border-t border-gray-200">
                      <button
                        onClick={() => handleArchive(modalScholarshipId!)}
                        disabled={loadingStates.archiving}
                        className="flex-1 bg-orange-600 text-white text-sm font-semibold py-3 px-4 rounded-md hover:bg-orange-700 disabled:opacity-50 transition-colors"
                      >
                        {loadingStates.archiving ? "Archiving..." : "Archive Scholarship"}
                      </button>

                      <button
                        onClick={handleDelete}
                        disabled={loadingStates.deleting}
                        className="flex-1 bg-red-600 text-white text-sm font-semibold py-3 px-4 rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {loadingStates.deleting ? "Deleting..." : "Delete Scholarship"}
                      </button>

                      <button
                        onClick={() => {
                          if (isEditing) {
                            setActionType("publish");
                            setConfirmMessage("Are you sure you want to save changes?");
                            setShowConfirmationModal(true);
                          } else {
                            setIsEditing(true);
                          }
                        }}
                        disabled={loadingStates.saving}
                        className="flex-1 bg-[#fcd116] text-black text-sm font-semibold py-3 px-4 rounded-md hover:brightness-90 disabled:opacity-50 transition-all"
                      >
                        {loadingStates.saving ? "Saving..." : (isEditing ? "Save Changes" : "Edit Information")}
                      </button>

                      <a
                        href={`/scholarship-listing/Scholarship-Listing-Applicants?scholarshipId=${modalScholarshipId}`}
                        className="flex-1 bg-[#1167B1] text-white text-sm font-semibold py-3 px-4 rounded-md text-center hover:bg-[#0A4F9E] transition-colors"
                      >
                        View Applicants
                      </a>
                    </div>

                    {isEditing && (
                      <div className="flex justify-end gap-3 mt-4">
                        <button
                          onClick={() => {
                            setIsEditing(false);
                            const scholarship = scholarshipListings.find(s => s.id === modalScholarshipId);
                            if (scholarship) {
                              setForm({
                                title: scholarship.title,
                                desc: scholarship.desc,
                                company: scholarship.company,
                                companyEmail: scholarship.companyEmail,
                                eligibility: scholarship.eligibility,
                                deadline: scholarship.deadline,
                                location: scholarship.location,
                                img: scholarship.img,
                                createdAt: (typeof scholarship.createdAt === 'object' && scholarship.createdAt && 'seconds' in scholarship.createdAt)
                                  ? scholarship.createdAt
                                  : undefined,
                              });
                              setPreviewUrl(scholarship.img);
                              setFileName(scholarship.img.split('/').pop() || "");
                            }
                            setFormErrors({});
                          }}
                          className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {showConfirmationModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-[100]">
            <div className="bg-white p-6 rounded-lg shadow-2xl text-center max-w-md mx-4">
              <div className="mb-4">
                {actionType === 'delete' && (
                  <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                  </div>
                )}
                {actionType === 'archive' && (
                  <div className="w-16 h-16 mx-auto mb-4 bg-orange-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8l6 6 6-6"></path>
                    </svg>
                  </div>
                )}
                {actionType === 'publish' && (
                  <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>
                )}
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Action</h3>
              <p className="text-gray-600 mb-6">{confirmMessage}</p>

              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowConfirmationModal(false)}
                  className="px-6 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmAction}
                  disabled={Object.values(loadingStates).some(Boolean)}
                  className={`px-6 py-2 text-white rounded-md transition-colors disabled:opacity-50 ${
                    actionType === 'delete'
                      ? 'bg-red-600 hover:bg-red-700'
                      : actionType === 'archive'
                      ? 'bg-orange-600 hover:bg-orange-700'
                      : 'bg-[#1167B1] hover:bg-[#0A4F9E]'
                  }`}
                >
                  {Object.values(loadingStates).some(Boolean) ? "Processing..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success Modal */}
        {showSuccessModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-[100]">
            <div className="bg-white p-6 rounded-lg shadow-2xl text-center max-w-md mx-4">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Success!</h3>
              <p className="text-gray-600 mb-6">{confirmMessage}</p>
              <button
                onClick={() => setShowSuccessModal(false)}
                className="px-6 py-2 bg-[#1167B1] text-white rounded-md hover:bg-[#0A4F9E] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        <Navbar />
      </div>
    </RequireAuth>
  );
}