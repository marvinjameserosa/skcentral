'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Navbar from '../../Components/Navbar';
import RequireAuth from '@/app/Components/RequireAuth';
import { db, storage } from '@/app/Firebase/firebase';
import { doc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { recordActivityLog } from '@/app/Components/recordActivityLog';
import { getAuth, User } from 'firebase/auth';
import Link from 'next/link';

interface EventData {
  eventId: string;
  title: string;
  description: string;
  date: string;
  eventTime: string;
  deadline: string;
  location: string;
  capacity: string;
  image: string;
  tags: string[];
}

type Errors = Partial<Record<keyof EventData, string>>;

const auth = getAuth();

const YOUTH_CLASSIFICATIONS = [
  'In-School Youth',
  'Out-of-School Youth',
  'Working Youth',
  'Youth with Disability',
  'Young Professional',
  'SK Official',
];

export default function CommunityEventCreate() {
  const [formData, setFormData] = useState<EventData>({
    eventId: '',
    title: '',
    description: '',
    date: '',
    eventTime: '',
    deadline: '',
    location: '',
    capacity: '',
    image: '',
    tags: [],
  });

  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);

  // Simple authentication and activity logging - INTEGRATED
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setAuthUser(currentUser);

        try {
          // Log page access with specific page name
          await recordActivityLog({
            action: "View Page",
            details: "User accessed the Create Community Event page",
            userId: currentUser.uid,
            userEmail: currentUser.email || undefined,
            category: "admin",
          });
          console.log('✅ Page visit logged for Create Community Event page');
        } catch (error) {
          console.error('❌ Error logging page visit:', error);
        }
      } else {
        setAuthUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  /** ✅ Handlers */
  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (value) setErrors((prev) => ({ ...prev, [name]: '' }));

    // Log form field changes for important fields
    if (authUser && (name === 'title' || name === 'description') && value.trim()) {
      await recordActivityLog({
        action: 'Edit Event Form',
        details: `Updated event ${name}: "${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"`,
        userId: authUser.uid,
        userEmail: authUser.email || undefined,
        category: 'events',
      });
    }
  };

  const handleTagToggle = async (tag: string) => {
    const wasSelected = formData.tags.includes(tag);
    setFormData((prev) => ({
      ...prev,
      tags: wasSelected
        ? prev.tags.filter((t) => t !== tag)
        : [...prev.tags, tag],
    }));

    // Log tag selection
    if (authUser) {
      await recordActivityLog({
        action: wasSelected ? 'Remove Event Tag' : 'Add Event Tag',
        details: `${wasSelected ? 'Removed' : 'Added'} tag: ${tag}`,
        userId: authUser.uid,
        userEmail: authUser.email || undefined,
        category: 'events',
      });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);

      // Log file selection
      if (authUser) {
        await recordActivityLog({
          action: 'Select Event Image',
          details: `Selected image file: ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)}MB)`,
          userId: authUser.uid,
          userEmail: authUser.email || undefined,
          category: 'events',
        });
      }
    }
  };

  const handleDeletePhoto = async () => {
    if (window.confirm('Are you sure you want to delete this photo?')) {
      const fileName = file?.name;
      setFile(null);

      // Log photo deletion
      if (authUser && fileName) {
        await recordActivityLog({
          action: 'Remove Event Image',
          details: `Removed image file: ${fileName}`,
          userId: authUser.uid,
          userEmail: authUser.email || undefined,
          category: 'events',
        });
      }
    }
  };

  /** ✅ Validation */
  const validateForm = (): Errors => {
    const formErrors: Errors = {};
    if (!formData.title) formErrors.title = 'Title is required';
    if (!formData.description) formErrors.description = 'Description is required';
    if (!formData.date) formErrors.date = 'Event Date is required';
    if (!formData.eventTime) formErrors.eventTime = 'Event Time is required';
    if (!formData.deadline) formErrors.deadline = 'Deadline is required';
    if (!formData.location) formErrors.location = 'Location is required';
    if (!formData.capacity) formErrors.capacity = 'Capacity is required';
    if (formData.tags.length === 0) formErrors.tags = 'At least one classification is required';
    return formErrors;
  };

  /** ✅ Firestore Upload */
  const handleConfirmUpload = async () => {
    if (!authUser) {
      alert('You must be logged in to create an event');
      return;
    }

    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setShowConfirmation(false);
      
      // Log validation errors
      await recordActivityLog({
        action: 'Event Creation Validation Failed',
        details: `Validation failed for fields: ${Object.keys(validationErrors).join(', ')}`,
        userId: authUser.uid,
        userEmail: authUser.email || undefined,
        category: 'events',
      });
      return;
    }

    setIsUploading(true);
    setShowConfirmation(false);

    try {
      let imageUrl = '';
      if (file) {
        const storageRef = ref(storage, `event-images/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        imageUrl = await getDownloadURL(storageRef);
      }

      const newEventId = Date.now().toString();

      const completeEvent: EventData & { 
        createdAt: string; 
        time: string;
        createdBy: string;
        createdByEmail: string;
        status: string;
      } = {
        ...formData,
        eventId: newEventId,
        image: imageUrl,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        createdAt: new Date().toLocaleString('en-GB', {
          timeZone: 'Asia/Singapore',
          hour12: true,
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).replace(',', ' at'),
        createdBy: authUser.uid,
        createdByEmail: authUser.email || 'unknown',
        status: 'active',
      };

      // Add event to Firestore
      await setDoc(doc(db, 'events', newEventId), completeEvent);

      // Add notification for all users
      await addDoc(collection(db, 'notifications'), {
        userId: 'all',
        type: 'event',
        title: 'New Community Event Created',
        body: `A new event "${formData.title}" has been posted. Check it out!`,
        createdAt: serverTimestamp(),
        read: false,
        eventId: newEventId,
      });

      // Log successful event creation
      await recordActivityLog({
        action: 'Create Event',
        details: `Successfully created event: "${formData.title}" (ID: ${newEventId}) with capacity ${formData.capacity}`,
        userId: authUser.uid,
        userEmail: authUser.email || undefined,
        category: 'events',
      });

      setShowSuccess(true);
      resetForm();
    } catch (error) {
      console.error('Error uploading event: ', error);
      
      // Log error
      await recordActivityLog({
        action: 'Create Event Error',
        details: `Failed to create event "${formData.title}": ${error}`,
        userId: authUser.uid,
        userEmail: authUser.email || undefined,
        category: 'events',
        severity: 'medium',
      });
      
      alert('Failed to create event. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  /** ✅ Reset Form */
  const resetForm = async () => {
    if (authUser) {
      await recordActivityLog({
        action: 'Reset Event Form',
        details: 'Event creation form reset after successful submission',
        userId: authUser.uid,
        userEmail: authUser.email || undefined,
        category: 'events',
      });
    }

    setTimeout(() => {
      setFormData({
        eventId: '',
        title: '',
        description: '',
        date: '',
        eventTime: '',
        deadline: '',
        location: '',
        capacity: '',
        image: '',
        tags: [],
      });
      setFile(null);
      setShowSuccess(false);
    }, 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Log form submission attempt
    if (authUser) {
      await recordActivityLog({
        action: 'Submit Event Form',
        details: `Attempted to submit event form: "${formData.title}"`,
        userId: authUser.uid,
        userEmail: authUser.email || undefined,
        category: 'events',
      });
    }
    
    setShowConfirmation(true);
  };

  const handleCancel = async () => {
    if (authUser) {
      await recordActivityLog({
        action: 'Cancel Event Creation',
        details: 'Cancelled event creation process',
        userId: authUser.uid,
        userEmail: authUser.email || undefined,
        category: 'events',
      });
    }
    setShowConfirmation(false);
  };

  return (
    <RequireAuth>
      <div className="ml-[260px] min-h-screen bg-[#e7f0fa] overflow-auto">
        <div className="p-6">
          {/* Page Header */}
      <header className="mb-6">
      <Link href="/community-event">
        <div className="cursor-pointer flex flex-col">
          <div className="flex items-center space-x-2">
        <Image
          src="/ArrowBackIcon.svg"
          alt="Arrow Back"
          width={24}
          height={24}
          style={{ fill: '#11459B' }}
        />
        <h1 className="text-3xl font-semibold text-gray-800">Create Community Event</h1>
          </div>
          <p className="text-lg text-gray-600 mt-2">
        The hub that connects kabataan with events and activities led by the SK Federation.
          </p>
        </div>
      </Link>
      </header>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-wrap gap-6">
            {/* Event Details */}
            <div className="bg-white rounded-xl shadow-md p-6 flex-1 min-w-[400px] max-w-[800px]">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Event Details</h2>

              <InputField
                label="Title"
                name="title"
                type="text"
                value={formData.title}
                onChange={handleInputChange}
                error={errors.title}
                placeholder="e.g., Dental Mission"
              />

              <TextareaField
                label="Description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                error={errors.description}
                placeholder="Write a brief description of the event..."
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                <InputField
                  label="Event Date"
                  name="date"
                  type="date"
                  value={formData.date}
                  onChange={handleInputChange}
                  error={errors.date}
                />
                <InputField
                  label="Event Time"
                  name="eventTime"
                  type="time"
                  value={formData.eventTime}
                  onChange={handleInputChange}
                  error={errors.eventTime}
                />
              </div>

              <InputField
                label="Registration Deadline"
                name="deadline"
                type="date"
                value={formData.deadline}
                onChange={handleInputChange}
                error={errors.deadline}
                max={formData.date || undefined}
              />

              <InputField
                label="Location"
                name="location"
                type="text"
                value={formData.location}
                onChange={handleInputChange}
                error={errors.location}
                placeholder="e.g., City Hall, Quezon City"
              />

              <InputField
                label="Capacity"
                name="capacity"
                type="number"
                value={formData.capacity}
                onChange={handleInputChange}
                error={errors.capacity}
                placeholder="e.g., 50"
              />

              <div className="mb-4">
                <label className="block text-sm font-semibold text-[#08326A] mb-2">
                  Youth Classification
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {YOUTH_CLASSIFICATIONS.map((tag) => (
                    <label key={tag} className="inline-flex items-center bg-[#D4EEFF] px-3 py-2 rounded-md shadow-sm">
                      <input
                        type="checkbox"
                        checked={formData.tags.includes(tag)}
                        onChange={() => handleTagToggle(tag)}
                        className="form-checkbox text-[#1167B1] mr-2"
                      />
                      <span className="text-sm">{tag}</span>
                    </label>
                  ))}
                </div>
                {errors.tags && <p className="text-red-500 text-xs mt-1">{errors.tags}</p>}
              </div>
            </div>

            {/* Media Section */}
            <div className="bg-white rounded-xl shadow-md p-6 flex-1 min-w-[400px] max-w-[800px]">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Media</h2>
              <p className="text-sm text-gray-600 mb-4">Upload an image for the event.</p>

              <div className="flex justify-center items-center w-full">
                {!file ? (
                  <button
                    type="button"
                    className="w-full bg-[#11459B] text-white font-semibold text-lg py-3 rounded-md hover:bg-[#0d3b85] transition"
                    onClick={() => document.getElementById('file-upload')?.click()}
                  >
                    + Add Picture
                  </button>
                ) : (
                  <div className="relative w-full h-64">
                    <Image
                      src={URL.createObjectURL(file)}
                      alt="Uploaded event"
                      fill
                      style={{ objectFit: 'contain' }}
                      unoptimized
                    />
                    <button
                      type="button"
                      onClick={handleDeletePhoto}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 transition"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
              <input
                id="file-upload"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Submit Button */}
            <div className="w-full mt-2">
              <button
                type="submit"
                className="w-full bg-[#11459B] text-white font-semibold text-lg py-3 rounded-md hover:bg-[#0d3b85] transition disabled:bg-gray-500 disabled:cursor-not-allowed"
                disabled={isUploading}
              >
                {isUploading ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </form>
        </div>

        {/* Confirmation Modal */}
        {showConfirmation && (
          <Modal
            title="Are you sure you want to publish this event?"
            description="This action cannot be undone."
            onCancel={handleCancel}
            onConfirm={handleConfirmUpload}
          />
        )}

        {/* Success Modal */}
        {showSuccess && (
          <Modal title="Event has been posted!" onConfirm={() => setShowSuccess(false)} />
        )}
        <Navbar />
      </div>
    </RequireAuth>
  );
}

/** ✅ Reusable InputField */
function InputField({
  label,
  name,
  type,
  value,
  onChange,
  error,
  placeholder,
  max,
}: {
  label: string;
  name: string;
  type: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  placeholder?: string;
  max?: string;
}) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-semibold text-[#08326A] mb-1">
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        max={max}
        className={`w-full bg-[#D4EEFF] rounded-md p-2 text-sm outline-none shadow-sm ${
          error ? 'border-2 border-red-500' : ''
        }`}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

/** ✅ Reusable TextareaField */
function TextareaField({
  label,
  name,
  value,
  onChange,
  error,
  placeholder,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  error?: string;
  placeholder?: string;
}) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-semibold text-[#08326A] mb-2">
        {label}
      </label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        rows={3}
        placeholder={placeholder}
        className={`w-full bg-[#D4EEFF] rounded-md p-2 text-sm outline-none resize-none shadow-sm ${
          error ? 'border-2 border-red-500' : ''
        }`}
      ></textarea>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

/** ✅ Reusable Modal */
function Modal({
  title,
  description,
  onCancel,
  onConfirm,
}: {
  title: string;
  description?: string;
  onCancel?: () => void;
  onConfirm?: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-md p-8 shadow-lg border border-[#0A2F7A]">
        <h2 className="text-2xl font-bold text-[#0A2F7A] mb-4 text-center">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-gray-600 text-center mb-6">{description}</p>
        )}
        <div className="flex justify-center gap-4">
          {onCancel && (
            <button
              onClick={onCancel}
              className="w-full bg-[#FCD116] text-black text-lg font-bold py-3 rounded-md hover:bg-yellow-400 transition"
            >
              Cancel
            </button>
          )}
          {onConfirm && (
            <button
              onClick={onConfirm}
              className="w-full bg-[#1167B1] text-white text-lg font-bold py-3 rounded-md hover:bg-[#0e5290] transition"
            >
              Confirm
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
