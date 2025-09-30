"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { db, storage } from "@/app/Firebase/firebase";
import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { User, getAuth } from "firebase/auth";
import Navbar from "@/app/Components/Navbar";
import RequireAuth from "@/app/Components/RequireAuth";
import { recordActivityLog } from "@/app/Components/recordActivityLog";

interface FormData {
  title: string;
  body: string;
  endDate: string;
  selectedBarangays: string[];
  selectedYouthClassifications: string[];
  file: File | null;
}

const auth = getAuth();

const CreateAnnouncement = () => {
  return (
    <RequireAuth>
      {(user) => <CreateAnnouncementContent user={user} />}
    </RequireAuth>
  );
};

const CreateAnnouncementContent = ({ user }: { user: User }) => {
  // Form state
  const [formData, setFormData] = useState<FormData>({
    title: "",
    body: "",
    endDate: "",
    selectedBarangays: [],
    selectedYouthClassifications: [],
    file: null,
  });

  // UI state
  const [matchingFilterCount, setMatchingFilterCount] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setAuthUser] = useState<User | null>(null);

  // Simple authentication and activity logging - INTEGRATED
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setAuthUser(currentUser);

        try {
          // Log page access with specific page name
          await recordActivityLog({
            action: "View Page",
            details: "User accessed the Create Announcement page",
            userId: currentUser.uid,
            userEmail: currentUser.email || undefined,
            category: "user",
          });
          console.log('✅ Page visit logged for Create Announcement page');
        } catch (error) {
          console.error('❌ Error logging page visit:', error);
        }
      } else {
        setAuthUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const barangayOptions = [
    "Barangka",
    "Calumpang",
    "Concepcion I (Uno)",
    "Concepcion II (Dos)",
    "Fortune",
    "Industrial Valley Complex",
    "Jesus de la Peña",
    "Malanday",
    "Marikina Heights",
    "Nangka",
    "Parang",
    "San Roque",
    "Santa Elena",
    "Santo Niño",
    "Tañong",
    "Tumana",
  ];

  const youthClassificationOptions = [
    "In-School Youth",
    "Out-of-School Youth",
    "Working Youth",
    "Person with Disability",
    "Children in Conflict w/ Law",
    "Indigenous People",
  ];

  // Initialize user data - SIMPLIFIED (removed duplicate activity logging)
  useEffect(() => {
    const initializeUser = async () => {
      try {
        setIsLoading(true);
        // Removed duplicate activity logging since it's now handled in auth state change
      } catch (error) {
        console.error("Error initializing user:", error);
        setError("Failed to initialize user data");
      } finally {
        setIsLoading(false);
      }
    };
    initializeUser();
  }, [user]);

  // Update form data
  const updateFormData = useCallback((updates: Partial<FormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  // Handle multi-select changes
  const handleMultiSelect = useCallback((
    value: string,
    selectedItems: string[],
    field: "selectedBarangays" | "selectedYouthClassifications"
  ) => {
    const newItems = selectedItems.includes(value)
      ? selectedItems.filter((item) => item !== value)
      : [...selectedItems, value];
    updateFormData({ [field]: newItems });
  }, [updateFormData]);

  // Handle "Select All" functionality
  const handleSelectAll = useCallback((
    options: string[],
    selectedItems: string[],
    field: "selectedBarangays" | "selectedYouthClassifications"
  ) => {
    const newItems = selectedItems.length === options.length ? [] : [...options];
    updateFormData({ [field]: newItems });
  }, [updateFormData]);

  // Handle file change with validation
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    try {
      if (selectedFile.size > 5 * 1024 * 1024) {
        throw new Error("File size must be less than 5MB");
      }
      if (!selectedFile.type.startsWith("image/")) {
        throw new Error("Please select an image file");
      }

      updateFormData({ file: selectedFile });
      await recordActivityLog({
        action: "Select Image",
        details: `Selected image file: ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)}MB)`,
        userId: user.uid,
        userEmail: user.email || undefined,
        category: "announcements",
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Invalid file selected");
      e.target.value = "";
    }
  }, [user, updateFormData]);

  // Remove image
  const removeImage = useCallback(async () => {
    if (formData.file) {
      await recordActivityLog({
        action: "Remove Image",
        details: `Removed image file: ${formData.file.name}`,
        userId: user.uid,
        userEmail: user.email || undefined,
        category: "announcements",
      });
    }
    updateFormData({ file: null });
  }, [formData.file, user, updateFormData]);

  // Fetch matching filter count
  const fetchMatchingCount = useCallback(async () => {
    try {
      const youthProfilingRef = collection(db, "youthProfiling");
      const snapshot = await getDocs(youthProfilingRef);

      const matchingDocs = snapshot.docs.filter((doc) => {
        const data = doc.data();
        if (formData.selectedBarangays.length > 0 && !formData.selectedBarangays.includes(data.barangay)) {
          return false;
        }
        if (formData.selectedYouthClassifications.length > 0 && !formData.selectedYouthClassifications.includes(data.youthClassification)) {
          return false;
        }
        return true;
      });

      setMatchingFilterCount(matchingDocs.length);
    } catch (error) {
      console.error("Error fetching matching filters:", error);
      setMatchingFilterCount(0);
    }
  }, [formData.selectedBarangays, formData.selectedYouthClassifications]);

  // Update matching count when filters change
  useEffect(() => {
    if (user) {
      fetchMatchingCount();
    }
  }, [fetchMatchingCount, user]);

  // Reset form fields
  const clearForm = useCallback(async () => {
    setFormData({
      title: "", body: "", endDate: "",
      selectedBarangays: [], selectedYouthClassifications: [], file: null,
    });
    setMatchingFilterCount(0);
    await recordActivityLog({
      action: "Clear Form",
      details: "Cleared announcement creation form",
      userId: user.uid,
      userEmail: user.email || undefined,
      category: "announcements",
    });
  }, [user]);

  // Validate form
  const validateForm = useCallback(() => {
    const errors: string[] = [];
    if (!formData.title.trim()) errors.push("Title is required");
    if (!formData.body.trim()) errors.push("Body is required");
    if (!formData.endDate) errors.push("End date is required");

    if (formData.endDate) {
      const selectedEndDate = new Date(formData.endDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedEndDate < today) {
        errors.push("End date cannot be in the past");
      }
    }
    return errors;
  }, [formData]);

  // Handle Publish button click
  const handlePublish = async () => {
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      alert(`Please fix the following errors:\n${validationErrors.join("\n")}`);
      return;
    }

    const isConfirmed = window.confirm(
      `Are you sure you want to publish this announcement?\n\nThis announcement will be active until: ${new Date(formData.endDate).toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      })}\n\nTarget audience: ${matchingFilterCount} youth profiles`
    );
    if (!isConfirmed) return;

    setIsPublishing(true);
    let imageUrl = "";

    try {
      // Upload file if provided
      if (formData.file) {
        const imageRef = ref(storage, `announcements/${Date.now()}-${formData.file.name}`);
        const snapshot = await uploadBytes(imageRef, formData.file);
        imageUrl = await getDownloadURL(snapshot.ref);
      }

      // Save announcement
      const docRef = await addDoc(collection(db, "announcements"), {
        title: formData.title.trim(),
        body: formData.body.trim(),
        description: formData.body.trim(),
        imageUrl,
        barangays: formData.selectedBarangays.length > 0 ? formData.selectedBarangays : barangayOptions,
        youthClassifications: formData.selectedYouthClassifications.length > 0 ? formData.selectedYouthClassifications : youthClassificationOptions,
        endDate: formData.endDate,
        isArchived: false,
        archived: false,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        targetAudienceCount: matchingFilterCount,
      });

      // Add notification for all users
      await addDoc(collection(db, "notifications"), {
        userId: "all",
        type: "announcement",
        title: "New Community Announcement",
        body: `${user.email || "Someone"} published a new announcement: "${formData.title.trim()}"`,
        createdAt: serverTimestamp(),
        read: false,
        announcementId: docRef.id,
      });

      await recordActivityLog({
        action: "Publish Announcement",
        details: `Successfully published announcement: "${formData.title}" (ID: ${docRef.id}) targeting ${matchingFilterCount} youth profiles`,
        userId: user.uid,
        userEmail: user.email || undefined,
        category: "announcements",
      });

      alert(`Announcement published successfully!\n\nID: ${docRef.id}\nTarget Audience: ${matchingFilterCount} youth profiles`);
      await clearForm();
      window.location.href = "/announcement";
    } catch (error) {
      console.error("Error publishing announcement: ", error);
      alert("Failed to publish announcement. Please check console for details.");
    } finally {
      setIsPublishing(false);
    }
  };

  // Handle cancel
  const handleCancel = useCallback(() => {
    const hasFormData = Object.values(formData).some((value) =>
      Array.isArray(value) ? value.length > 0 : Boolean(value)
    );

    if (hasFormData) {
      const confirmCancel = window.confirm("Are you sure you want to cancel? All changes will be lost.");
      if (confirmCancel) {
        clearForm();
        window.history.back();
      }
    } else {
      window.history.back();
    }
  }, [formData, clearForm]);

  if (isLoading) {
    return (
      <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-[#1167B1] mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold text-[#1167B1]">Loading...</h2>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">{error}</h2>
          <button onClick={() => window.location.reload()} className="bg-[#1167B1] hover:bg-[#0d4c8b] text-white px-6 py-2 rounded-md">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const validationErrors = validateForm();
  const isFormValid = validationErrors.length === 0;

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] flex flex-col gap-8 overflow-auto">
      <Navbar />

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-semibold text-black">Create Announcement</h1>
          <p className="text-lg text-gray-700 mt-1">Create a new announcement to notify the community based on selected filters.</p>
        </div>
        <button onClick={handleCancel} className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg" disabled={isPublishing}>
          ← Back
        </button>
      </div>

      {/* Filter Audience Section */}
      <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col gap-6">
        <h2 className="text-xl font-bold text-black">Filter Audience by Demographics</h2>

        <div className="flex flex-wrap gap-4 justify-between w-full">
          {/* Barangay Dropdown */}
          <MultiSelectDropdown
            label="Barangay"
            options={barangayOptions}
            selectedItems={formData.selectedBarangays}
            onSelect={(value) => handleMultiSelect(value, formData.selectedBarangays, "selectedBarangays")}
            onSelectAll={() => handleSelectAll(barangayOptions, formData.selectedBarangays, "selectedBarangays")}
            placeholder="Barangays"
          />

          {/* Youth Classification Dropdown */}
          <MultiSelectDropdown
            label="Youth Classification"
            options={youthClassificationOptions}
            selectedItems={formData.selectedYouthClassifications}
            onSelect={(value) => handleMultiSelect(value, formData.selectedYouthClassifications, "selectedYouthClassifications")}
            onSelectAll={() => handleSelectAll(youthClassificationOptions, formData.selectedYouthClassifications, "selectedYouthClassifications")}
            placeholder="Classifications"
          />
        </div>

        {/* Selected Items Display */}
        <SelectedItemsDisplay
          selectedBarangays={formData.selectedBarangays}
          selectedYouthClassifications={formData.selectedYouthClassifications}
          onRemoveBarangay={(value) => handleMultiSelect(value, formData.selectedBarangays, "selectedBarangays")}
          onRemoveClassification={(value) => handleMultiSelect(value, formData.selectedYouthClassifications, "selectedYouthClassifications")}
        />

        {/* Matching Count */}
        <div className="bg-[#D0EFFF] p-4 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-black font-medium">
                Matching Youth Profiles: <span className="font-bold text-xl text-blue-600">{matchingFilterCount}</span>
              </p>
              {(formData.selectedBarangays.length === 0 && formData.selectedYouthClassifications.length === 0) && (
                <p className="text-gray-600 text-sm mt-1">(All youth profiles will receive this announcement)</p>
              )}
            </div>
            <div className="bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-semibold">
              {matchingFilterCount} Recipients
            </div>
          </div>
        </div>
      </div>

      {/* Compose Announcement Section */}
      <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col gap-6">
        <h2 className="text-xl font-bold text-black">Compose Announcement</h2>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => updateFormData({ title: e.target.value })}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm"
            placeholder="Enter announcement title"
          />
        </div>

        {/* Body */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Body</label>
          <textarea
            value={formData.body}
            onChange={(e) => updateFormData({ body: e.target.value })}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm min-h-[120px]"
            placeholder="Enter announcement content"
          />
        </div>

        {/* End Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
          <input
            type="date"
            value={formData.endDate}
            onChange={(e) => updateFormData({ endDate: e.target.value })}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm"
          />
        </div>

        {/* Image Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Upload Image (Optional)</label>
          {formData.file ? (
            <div className="relative inline-block">
              <Image src={URL.createObjectURL(formData.file)} alt="Preview" width={200} height={200} className="rounded-lg border" unoptimized />
              <button type="button" onClick={removeImage} className="absolute top-0 right-0 bg-red-600 text-white rounded-full px-2 py-1 text-xs">×</button>
            </div>
          ) : (
            <input type="file" accept="image/*" onChange={handleFileChange} className="block w-full text-sm text-gray-700 border border-gray-300 rounded-lg cursor-pointer p-2" />
          )}
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h4 className="text-red-700 font-semibold text-sm mb-2">Please fix the following:</h4>
            <ul className="list-disc list-inside text-sm text-red-600">
              {validationErrors.map((err, idx) => <li key={idx}>{err}</li>)}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={handleCancel} className="px-6 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg" disabled={isPublishing}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePublish}
            className={`px-6 py-2 rounded-lg text-white ${isFormValid ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-400 cursor-not-allowed"}`}
            disabled={!isFormValid || isPublishing}
          >
            {isPublishing ? "Publishing..." : `Publish (${matchingFilterCount})`}
          </button>
        </div>
      </div>
    </div>
  );
};

// Multi-select dropdown component
function MultiSelectDropdown({ label, options, selectedItems, onSelect, onSelectAll, placeholder }: {
  label: string; options: string[]; selectedItems: string[];
  onSelect: (value: string) => void; onSelectAll: () => void; placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex flex-col flex-1 min-w-[220px] relative">
      <label className="text-base font-bold text-black mb-2">{label}</label>
      <div className="relative">
        <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full p-3 border rounded-lg border-gray-300 text-sm bg-[#D0EFFF] text-left flex justify-between items-center">
          <span className="truncate">
            {selectedItems.length === 0 ? `All ${placeholder}` : selectedItems.length === options.length ? `All ${placeholder}` : `${selectedItems.length} selected`}
          </span>
          <span className="ml-2">▼</span>
        </button>

        {isOpen && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            <div className="p-2 border-b">
              <button type="button" onClick={() => { onSelectAll(); setIsOpen(false); }} className="w-full text-left p-2 hover:bg-gray-100 rounded text-sm font-medium">
                {selectedItems.length === options.length ? "Deselect All" : "Select All"}
              </button>
            </div>
            {options.map((option) => (
              <div key={option} className="p-2">
                <label className="flex items-center cursor-pointer hover:bg-gray-100 rounded p-1">
                  <input type="checkbox" checked={selectedItems.includes(option)} onChange={() => onSelect(option)} className="mr-2" />
                  <span className="text-sm">{option}</span>
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
      {isOpen && <div className="fixed inset-0 z-5" onClick={() => setIsOpen(false)} />}
    </div>
  );
}

// Selected Items Display Component
function SelectedItemsDisplay({ selectedBarangays, selectedYouthClassifications, onRemoveBarangay, onRemoveClassification }: {
  selectedBarangays: string[]; selectedYouthClassifications: string[];
  onRemoveBarangay: (value: string) => void; onRemoveClassification: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      {selectedBarangays.length > 0 && (
        <div className="bg-blue-50 p-3 rounded-lg">
          <h4 className="font-semibold text-sm text-blue-800 mb-1">Selected Barangays:</h4>
          <div className="flex flex-wrap gap-1">
            {selectedBarangays.map((barangay) => (
              <span key={barangay} className="bg-blue-200 text-blue-800 px-2 py-1 rounded-full text-xs flex items-center">
                {barangay}
                <button onClick={() => onRemoveBarangay(barangay)} className="ml-1 text-blue-600 hover:text-blue-800">×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {selectedYouthClassifications.length > 0 && (
        <div className="bg-green-50 p-3 rounded-lg">
          <h4 className="font-semibold text-sm text-green-800 mb-1">Selected Youth Classifications:</h4>
          <div className="flex flex-wrap gap-1">
            {selectedYouthClassifications.map((classification) => (
              <span key={classification} className="bg-green-200 text-green-800 px-2 py-1 rounded-full text-xs flex items-center">
                {classification}
                <button onClick={() => onRemoveClassification(classification)} className="ml-1 text-green-600 hover:text-green-800">×</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CreateAnnouncement;