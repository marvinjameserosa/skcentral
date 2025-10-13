/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-unused-vars */
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
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
  setDoc,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { getAuth, type User } from "firebase/auth";
import Navbar from "../Components/Navbar";
import RequireAuth from "@/app/Components/RequireAuth";
import { recordActivityLog } from "@/app/Components/recordActivityLog";

const auth = getAuth();
interface JobType {
  id: string;
  position: string;
  description: string;
  company: string;
  companyEmail: string;
  salary: string;
  location: string;
  requirements: string;
  deadline: string;
  img: string;
  jobId: string;
  createdAt?: unknown;
  status?: 'active' | 'archived' | 'expired';
}

type ActionType = "save" | "archive" | "publish" | null;

interface LoadingStates {
  fetching: boolean;
  publishing: boolean;
  saving: boolean;
  archiving: boolean;
}

interface FormErrors {
  position?: string;
  description?: string;
  company?: string;
  companyEmail?: string;
  salary?: string;
  location?: string;
  requirements?: string;
  deadline?: string;
}

export default function JobListing() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [jobListings, setJobListings] = useState<JobType[]>([]);
  const [archivedJobs, setArchivedJobs] = useState<JobType[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired' | 'archived'>('active');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'deadline'>('newest');

  // User state
  const [user, setUser] = useState<User | null>(null);
  const [userDocId, setUserDocId] = useState<string>("");

  const [form, setForm] = useState({
    position: "",
    description: "",
    company: "",
    companyEmail: "",
    salary: "",
    location: "",
    requirements: "",
    deadline: "",
    img: "",
  });

  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [fileName, setFileName] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [modalJobId, setModalJobId] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [confirmMessage, setConfirmMessage] = useState("");

  const [loadingStates, setLoadingStates] = useState<LoadingStates>({
    fetching: false,
    publishing: false,
    saving: false,
    archiving: false,
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Authentication and user setup
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        await recordActivityLog({
          action: "View Page",
          details: "User accessed the Job Listing page",
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

  // Send notification to all users
  const sendNotificationToAllUsers = useCallback(async (title: string, message: string, type: 'job_posted' | 'job_updated' | 'job_archived' | 'job_deleted' = 'job_posted') => {
    try {
      const usersQuery = query(collection(db, "users"));
      const usersSnapshot = await getDocs(usersQuery);
      
      const notificationPromises = usersSnapshot.docs.map(async (userDoc) => {
        const userData = userDoc.data();
        await addDoc(collection(db, "notifications"), {
          userId: userDoc.id,
          userEmail: userData.email,
          title,
          message,
          type,
          isRead: false,
          createdAt: serverTimestamp(),
        });
      });

      await Promise.all(notificationPromises);
    } catch (error) {
      console.error("Error sending notifications:", error);
    }
  }, []);

  // Utility functions
  const updateLoadingState = useCallback((key: keyof LoadingStates, value: boolean) => {
    setLoadingStates(prev => ({ ...prev, [key]: value }));
  }, []);

  const showNotification = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setConfirmMessage(message);
    setShowSuccessModal(true);
  }, []);

  // Form validation
  const validateForm = useCallback((): FormErrors => {
    const errors: FormErrors = {};

    if (!form.position.trim()) errors.position = "Job position is required";
    if (!form.description.trim()) errors.description = "Job description is required";
    if (!form.company.trim()) errors.company = "Company name is required";
    if (!form.companyEmail.trim()) {
      errors.companyEmail = "Company email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.companyEmail)) {
      errors.companyEmail = "Invalid email format";
    }
    if (!form.salary.trim()) errors.salary = "Salary is required (e.g., ₱25,000 - ₱35,000 / mo)";
    if (!form.location.trim()) errors.location = "Location is required";
    if (!form.requirements.trim()) errors.requirements = "Requirements are required";
    if (!form.deadline) {
      errors.deadline = "Application deadline is required";
    } else if (new Date(form.deadline) < new Date(new Date().toDateString())) {
      errors.deadline = "Deadline cannot be in the past";
    }

    return errors;
  }, [form]);

  // Reset form function
  const resetForm = useCallback(() => {
    setForm({
      position: "",
      description: "",
      company: "",
      companyEmail: "",
      salary: "",
      location: "",
      requirements: "",
      deadline: "",
      img: "",
    });
    setSelectedFile(null);
    setPreviewUrl(null);
    setFileName(null);
    setFormErrors({});
  }, []);

  // Check if job is expired
  const isExpired = useCallback((deadline: string): boolean => {
    return new Date(deadline) < new Date(new Date().toDateString());
  }, []);

  // Fetch Job Listings with error handling
  const fetchJobListings = useCallback(async () => {
    updateLoadingState('fetching', true);
    try {
      const qJobs = query(collection(db, "jobListings"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(qJobs);
      const fetchedJobs = querySnapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<JobType, "id">;
        return {
          id: docSnap.id,
          ...data,
          status: isExpired(data.deadline) ? ('expired' as const) : ('active' as const),
        };
      });
      setJobListings(fetchedJobs);

      const archivedQ = query(collection(db, "archivedJobs"), orderBy("archivedAt", "desc"));
      const archivedSnapshot = await getDocs(archivedQ);
      const archived = archivedSnapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<JobType, "id">;
        return {
          id: docSnap.id,
          ...data,
          status: 'archived' as const,
        };
      });
      setArchivedJobs(archived);
    } catch (error) {
      console.error("Error fetching job listings: ", error);
      showNotification("Failed to fetch jobs. Please try again.", 'error');
    } finally {
      updateLoadingState('fetching', false);
    }
  }, [isExpired, showNotification, updateLoadingState]);

  // Filter and sort jobs
  const processedJobs = useMemo(() => {
    let filtered: JobType[] = [];
    if (filterStatus === 'all') {
      filtered = [...jobListings, ...archivedJobs];
    } else if (filterStatus === 'archived') {
      filtered = archivedJobs;
    } else {
      filtered = jobListings.filter(job => job.status === filterStatus);
    }
    if (searchTerm) {
      filtered = filtered.filter(job =>
        job.position.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.location.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    switch (sortBy) {
      case 'oldest':
        filtered = [...filtered].reverse();
        break;
      case 'deadline':
        filtered = [...filtered].sort((a, b) =>
          new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
        );
        break;
      default:
        break;
    }
    return filtered;
  }, [jobListings, archivedJobs, searchTerm, filterStatus, sortBy]);

  // Pagination
  const paginatedJobs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return processedJobs.slice(startIndex, startIndex + itemsPerPage);
  }, [processedJobs, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(processedJobs.length / itemsPerPage);

  useEffect(() => {
    fetchJobListings();
  }, [fetchJobListings]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, sortBy]);

  // Handle file selection with preview
  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setFileName(file.name);

    const fileReader = new FileReader();
    fileReader.onloadend = () => {
      setPreviewUrl(fileReader.result as string);
      setForm(prev => ({ ...prev, img: fileReader.result as string }));
    };
    fileReader.readAsDataURL(file);
  }, []);

  // Handle form changes
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, files } = e.target as HTMLInputElement;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
      if (formErrors[name as keyof FormErrors]) {
        setFormErrors(prev => ({ ...prev, [name]: undefined }));
      }
    }
  }, [handleFileSelect, formErrors]);

  // Upload image to storage
  const uploadImage = useCallback(async (file: File): Promise<string> => {
    const storageRef = ref(storage, `jobs/${Date.now()}_${file.name}`);
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
  }, []);

  // Delete image from storage (kept for updating images)
  const deleteImage = useCallback(async (imageUrl: string) => {
    if (imageUrl && imageUrl !== "/testpic.jpg") {
      try {
        const imageRef = ref(storage, imageUrl);
        await deleteObject(imageRef);
      } catch (error) {
        console.warn("Failed to delete old image:", error);
      }
    }
  }, []);

  // Enhanced publish function with activity logging and notifications
  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setActionType("publish");
    setConfirmMessage("Are you sure you want to publish this job?");
    setShowConfirmationModal(true);
  };

  const executePublish = async () => {
    updateLoadingState('publishing', true);
    try {
      let imageUrl = "/testpic.jpg";
      if (selectedFile) {
        imageUrl = await uploadImage(selectedFile);
      }
      const newJobData = {
        ...form,
        img: imageUrl,
        createdAt: serverTimestamp(),
        status: 'active' as const,
      };

      const docRef = await addDoc(collection(db, "jobListings"), newJobData);
      await updateDoc(docRef, { jobId: docRef.id });

      setJobListings(prev => [
        { ...newJobData, id: docRef.id, jobId: docRef.id },
        ...prev,
      ]);

      if (user) {
        await recordActivityLog({
          action: "Create Job",
          details: `Published new job: ${form.position} at ${form.company}`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: "admin",
        });
      }

      await sendNotificationToAllUsers(
        "New Job Posted! 🎉",
        `A new ${form.position} position is now available at ${form.company}. Apply now!`,
        'job_posted'
      );

      resetForm();
      showNotification("Job published successfully!");
    } catch (error) {
      console.error("Error publishing job: ", error);
      showNotification("Failed to publish job. Please try again.", 'error');
    } finally {
      updateLoadingState('publishing', false);
      setShowConfirmationModal(false);
    }
  };

  // Enhanced save function with activity logging and notifications
  const handleSave = () => {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    if (!modalJobId) {
      console.error("No job selected for update");
      return;
    }
    setActionType("save");
    setConfirmMessage("Are you sure you want to save changes to this job?");
    setShowConfirmationModal(true);
  };

  const executeSave = async () => {
    if (!modalJobId) return;
    updateLoadingState('saving', true);
    try {
      let imageUrl = form.img;
      if (selectedFile) {
        const oldJob = jobListings.find(j => j.id === modalJobId);
        if (oldJob?.img) {
          await deleteImage(oldJob.img);
        }
        imageUrl = await uploadImage(selectedFile);
      }
      const updatedData = {
        ...form,
        img: imageUrl,
        status: isExpired(form.deadline) ? ('expired' as const) : ('active' as const),
      };

      const jobRef = doc(db, "jobListings", modalJobId);
      await updateDoc(jobRef, updatedData);

      setJobListings(prev =>
        prev.map(job =>
          job.id === modalJobId ? { ...job, ...updatedData } : job
        )
      );

      if (user) {
        await recordActivityLog({
          action: "Update Job",
          details: `Updated job: ${form.position} at ${form.company}`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: "admin",
        });
      }

      await sendNotificationToAllUsers(
        "Job Updated! 📝",
        `The ${form.position} position at ${form.company} has been updated. Check it out!`,
        'job_updated'
      );

      setModalJobId(null);
      setIsEditing(false);
      resetForm();
      showNotification("Job updated successfully!");
    } catch (error) {
      console.error("Error updating job: ", error);
      showNotification("Failed to update job. Please try again.", 'error');
    } finally {
      updateLoadingState('saving', false);
      setShowConfirmationModal(false);
    }
  };

  // Enhanced archive function with activity logging and notifications
  const handleArchive = (jobId: string) => {
    setActionType("archive");
    setConfirmMessage("Are you sure you want to archive this job? It will be moved to an archived section.");
    setShowConfirmationModal(true);
    setModalJobId(jobId);
  };

  const executeArchive = async () => {
    if (!modalJobId) return;
    updateLoadingState('archiving', true);
    try {
      const jobRef = doc(db, "jobListings", modalJobId);
      const jobSnap = await getDoc(jobRef);
      if (jobSnap.exists()) {
        const jobData = jobSnap.data();
        await setDoc(doc(db, "archivedJobs", modalJobId), {
          ...jobData,
          archivedAt: serverTimestamp(),
        });
        await deleteDoc(jobRef);
        setJobListings(prev => prev.filter(j => j.id !== modalJobId));

        if (user) {
          await recordActivityLog({
            action: "Archive Job",
            details: `Archived job: ${jobData.position} at ${jobData.company}`,
            userId: user.uid,
            userEmail: user.email || undefined,
            category: "admin",
          });
        }

        await sendNotificationToAllUsers(
          "Job Archived 📦",
          `The ${jobData.position} position at ${jobData.company} has been archived and is no longer accepting applications.`,
          'job_archived'
        );

        showNotification("Job archived successfully!");
      } else {
        showNotification("Job not found for archiving.", 'error');
      }
    } catch (error) {
      console.error("Error archiving job: ", error);
      showNotification("Failed to archive job. Please try again.", 'error');
    } finally {
      updateLoadingState('archiving', false);
      setShowConfirmationModal(false);
      setModalJobId(null);
    }
  };

  // Handle confirmations
  const handleConfirmAction = async () => {
    switch (actionType) {
      case "publish":
        await executePublish();
        break;
      case "save":
        await executeSave();
        break;
      case "archive":
        await executeArchive();
        break;
      default:
        break;
    }
  };

  const handleCancelConfirmation = () => {
    setShowConfirmationModal(false);
    setActionType(null);
    setModalJobId(null);
    if (isEditing) {
      setIsEditing(false);
      if (modalJobId) {
        const job = jobListings.find(j => j.id === modalJobId);
        if (job) {
          setForm({
            position: job.position,
            description: job.description,
            company: job.company,
            companyEmail: job.companyEmail,
            salary: job.salary,
            location: job.location,
            requirements: job.requirements,
            deadline: job.deadline,
            img: job.img,
          });
        }
      }
    }
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
  };

  // Populate form when editing
  useEffect(() => {
    if (modalJobId) {
      const job = jobListings.find(j => j.id === modalJobId);
      if (job) {
        setForm({
          position: job.position,
          description: job.description,
          company: job.company,
          companyEmail: job.companyEmail,
          salary: job.salary,
          location: job.location,
          requirements: job.requirements,
          deadline: job.deadline,
          img: job.img,
        });
        setPreviewUrl(job.img);
        setFileName(job.img.split('/').pop() || null);
      }
    } else {
      resetForm();
    }
  }, [modalJobId, jobListings, resetForm]);

  // Render form field with error
  const renderFormField = (
    id: string,
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
            formErrors[id as keyof FormErrors] ? 'border-red-500' : 'border-transparent'
          }`}
          value={(form as any)[id] ?? ""}
          onChange={handleChange}
          disabled={modalJobId ? !isEditing : false}
        />
      ) : (
        <input
          id={id}
          name={id}
          type={type}
          required={required}
          placeholder={placeholder}
          className={`w-full bg-blue-100 p-2 rounded border ${
            formErrors[id as keyof FormErrors] ? 'border-red-500' : 'border-transparent'
          }`}
          value={(form as any)[id] ?? ""}
          onChange={handleChange}
          disabled={modalJobId ? !isEditing : false}
        />
      )}
      {formErrors[id as keyof FormErrors] && (
        <p className="text-red-500 text-xs mt-1">{formErrors[id as keyof FormErrors]}</p>
      )}
    </div>
  );

  return (
    <RequireAuth>
      <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa]">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-gray-800">Job Listing</h1>
          <p className="text-lg text-gray-600 mt-1">
            The hub that connects job seekers with opportunities.
          </p>
        </div>

        {/* Post Job Form */}
        {!modalJobId && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-8 mt-4">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Post New Job</h2>
            <form onSubmit={handlePublishSubmit} className="space-y-4">
              {renderFormField("position", "Job Position", "text", true, "e.g., Frontend Developer")}
              {renderFormField("description", "Job Description", "text", true, "Describe the role, responsibilities, and expectations", "textarea")}
              <div className="flex gap-3 w-full">
                <div className="w-full">
                  {renderFormField("company", "Company", "text", true, "Company Name")}
                </div>
                <div className="w-full">
                  {renderFormField("companyEmail", "Company Email", "email", true, "hr@company.com")}
                </div>
              </div>
              <div className="flex gap-3 w-full">
                <div className="w-full">
                  {renderFormField("salary", "Salary", "text", true, "e.g., ₱25,000 - ₱35,000 / month")}
                </div>
                <div className="w-full">
                  {renderFormField("deadline", "Application Deadline", "date", true)}
                </div>
              </div>
              <div className="flex gap-3 w-full">
                <div className="w-full">
                  {renderFormField("location", "Location", "text", true, "e.g., Remote, Makati, QC")}
                </div>
                <div className="w-full">
                  {renderFormField("requirements", "Requirements", "text", true, "Key skills/qualifications (comma-separated)")}
                </div>
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
                      alt={form.position ? `Preview for ${form.position}` : "Job Preview Image"}
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
                  placeholder="Search jobs..."
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
              Showing {paginatedJobs.length} of {processedJobs.length} jobs
            </div>
          </div>
        </div>

        {/* Current Job Listings */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-900">Current Job Listings</h2>
            <a
              href="/job-listing/Job-Listing-Applicants"
              className="bg-[#1167B1] text-white text-sm font-bold py-2 px-4 rounded-md hover:bg-[#0e5290] transition-colors"
            >
              View all Applicants
            </a>
          </div>

          {loadingStates.fetching ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#1167B1]"></div>
              <p className="mt-2 text-gray-600">Loading jobs...</p>
            </div>
          ) : paginatedJobs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchTerm || filterStatus !== 'all' ? "No jobs match your filters." : "No jobs found."}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pb-4">
              {paginatedJobs.map((job) => (
                <div
                  key={job.id}
                  className="bg-white rounded-lg shadow-md transform transition-all duration-300 hover:scale-105 hover:shadow-xl cursor-pointer relative"
                  onClick={() => setModalJobId(job.id)}
                >
                  <div className="absolute top-2 right-2 z-10">
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        job.status === 'expired'
                          ? 'bg-red-100 text-red-800'
                          : job.status === 'archived'
                          ? 'bg-gray-300 text-gray-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {job.status === 'expired'
                        ? 'Expired'
                        : job.status === 'archived'
                        ? 'Archived'
                        : 'Active'}
                    </span>
                  </div>
                  <Image
                    src={job.img || "/testpic.jpg"}
                    alt={job.position ? `Image for ${job.position}` : "Job Listing Image"}
                    width={280}
                    height={200}
                    className="rounded-t-lg object-cover w-full h-[200px]"
                    unoptimized
                  />
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 text-lg mb-1 line-clamp-2">
                      {job.position}
                    </h3>
                    <p className="text-sm text-gray-600 mb-1">{job.company}</p>
                    <p className="text-sm text-gray-600 mb-2">Salary: {job.salary}</p>
                    <p className="text-sm text-gray-700 leading-tight line-clamp-3">
                      {job.description}
                    </p>
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-500">
                        Deadline: {new Date(job.deadline).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        Location: {job.location}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Enhanced Pagination */}
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

        {/* Enhanced Modal for Job Details */}
        {modalJobId && (
          <div className="fixed inset-0 bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#e7f0fa] rounded-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto p-6 text-left shadow-xl border-2 border-[#0A2F7A] relative">
              <button
                onClick={() => {
                  setModalJobId(null);
                  setIsEditing(false);
                  resetForm();
                }}
                className="absolute top-4 right-4 w-8 h-8 bg-red-600 text-white text-xl font-bold rounded-full hover:bg-red-700 transition-colors z-10"
              >
                ×
              </button>

              {jobListings.find(job => job.id === modalJobId) && (
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Image Section */}
                  <div className="lg:w-[420px] flex-shrink-0 flex flex-col items-center">
                    <div className="relative">
                      <img
                        src={previewUrl || form.img || "/testpic.jpg"}
                        alt={form.position ? `Image for ${form.position}` : "Job Modal Image"}
                        className="w-full lg:w-[420px] h-[300px] lg:h-[420px] object-cover rounded-lg border-2 border-[#1167B1]"
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
                        {renderFormField("position", "Job Position")}
                      </div>
                      <div className="lg:col-span-2">
                        {renderFormField("description", "Job Description", "text", true, "Enter description", "textarea")}
                      </div>
                      {renderFormField("company", "Company")}
                      {renderFormField("companyEmail", "Company Email", "email")}
                      {renderFormField("salary", "Salary")}
                      {renderFormField("location", "Location")}
                      {renderFormField("requirements", "Requirements")}
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
                        onClick={() => handleArchive(modalJobId!)}
                        disabled={loadingStates.archiving}
                        className="flex-1 bg-orange-600 text-white text-sm font-semibold py-3 px-4 rounded-md hover:bg-orange-700 disabled:opacity-50 transition-colors"
                      >
                        {loadingStates.archiving ? "Archiving..." : "Archive Job"}
                      </button>

                      <button
                        onClick={() => {
                          if (isEditing) {
                            handleSave();
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
                        href={`/job-listing/Job-Listing-Applicants?jobId=${modalJobId}`}
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
                            const job = jobListings.find(j => j.id === modalJobId);
                            if (job) {
                              setForm({
                                position: job.position,
                                description: job.description,
                                company: job.company,
                                companyEmail: job.companyEmail,
                                salary: job.salary,
                                location: job.location,
                                requirements: job.requirements,
                                deadline: job.deadline,
                                img: job.img,
                              });
                              setPreviewUrl(job.img);
                              setFileName(job.img.split('/').pop() || null);
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

        {/* Enhanced Confirmation Modal */}
        {showConfirmationModal && (
          <div className="fixed inset-0 bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-[100]">
            <div className="bg-white p-6 rounded-lg shadow-2xl text-center max-w-md mx-4">
              <div className="mb-4">
                {(actionType === 'publish' || actionType === 'save') && (
                  <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
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
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Action</h3>
              <p className="text-gray-600 mb-6">{confirmMessage}</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleCancelConfirmation}
                  className="px-6 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmAction}
                  disabled={Object.values(loadingStates).some(Boolean)}
                  className={`px-6 py-2 text-white rounded-md transition-colors disabled:opacity-50 ${
                    actionType === 'archive'
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

        {/* Enhanced Success/Error Modal */}
        {showSuccessModal && (
          <div className="fixed inset-0 bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-[100]">
            <div className="bg-white p-6 rounded-lg shadow-2xl text-center max-w-md mx-4">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Success!</h3>
              <p className="text-gray-600 mb-6">{confirmMessage}</p>
              <button
                onClick={handleCloseSuccessModal}
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
