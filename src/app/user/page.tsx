'use client';

import React, { useState, useEffect, ChangeEvent } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, Timestamp, orderBy } from 'firebase/firestore';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { db, auth } from '@/app/Firebase/firebase';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Navbar from '../Components/Navbar';
import RequireAuth from '../Components/RequireAuth';
import Image from 'next/image';
import { recordActivityLog } from '@/app/Components/recordActivityLog';

interface IUserData {
  name: string;
  profilePictureUrl?: string;
  lastProfileUpload?: Timestamp;
  skId: string;
  position: string;  
  gender: string;
  email: string;
  birthday: string;
  civilStatus: string;
  phoneNumber: string;
  barangay: string;
}

interface INotification {
  id: string;
  title: string;
  message: string; // Changed from 'body' to 'message' to match chat notifications
  type: string;
  createdAt: Timestamp;
  read: boolean;
  userId: string;
  sentBy?: string;
  sentByEmail?: string;
  chatGroup?: string;
}

export default function UserProfile() {
  const [userData, setUserData] = useState<IUserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [defaultProfilePicture, setDefaultProfilePicture] = useState('/ExampleProfile.png');
  const [notifications, setNotifications] = useState<INotification[]>([]);
  const [allNotifications, setAllNotifications] = useState<INotification[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Modal states
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showIdCard, setShowIdCard] = useState(false);
  const [generatedIdImage, setGeneratedIdImage] = useState<string | null>(null);
  const [showAllNotifications, setShowAllNotifications] = useState(false);

  // Notification filter states
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [notificationTypeFilter, setNotificationTypeFilter] = useState<'all' | 'announcement' | 'system' | 'admin'>('all');
  const [notificationSearch, setNotificationSearch] = useState('');

  // Firestore reference for updating
  const [userDocId, setUserDocId] = useState<string | null>(null);

  // Restriction states
  const [canChangePicture, setCanChangePicture] = useState(true);
  const [daysLeft, setDaysLeft] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        try {
          const q = query(collection(db, 'adminUsers'), where('uid', '==', user.uid));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            const docSnap = querySnapshot.docs[0];
            setUserDocId(docSnap.id);
            const data = docSnap.data();
            setUserData(data as IUserData);

            if (data.profilePictureUrl) {
              setDefaultProfilePicture(data.profilePictureUrl);
            }

            if (data.lastProfileUpload) {
              const lastUpload = data.lastProfileUpload.toDate();
              const now = new Date();
              const diffInMs = now.getTime() - lastUpload.getTime();
              const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

              if (diffInDays < 90) {
                setCanChangePicture(false);
                setDaysLeft(90 - Math.floor(diffInDays));
              } else {
                setCanChangePicture(true);
                setDaysLeft(0);
              }
            }

            // Fetch notifications
            await fetchNotifications(user.uid);
            await fetchAllNotifications(user.uid);

            // Log profile view activity
            recordActivityLog({
              action: "Viewed User Profile",
              details: "User accessed their profile page",
              userId: user.uid,
              userEmail: user.email || undefined,
              category: "user",
              severity: "low",
              metadata: {
                profileSection: "main",
                timestamp: new Date().toISOString()
              }
            });
          } else {
            console.log('No such user document!');
            setUserData(null);
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchNotifications = async (userId: string) => {
    try {
      const notificationsRef = collection(db, 'notifications');
      
      // Create separate queries for user-specific and global notifications
      const userNotificationsQuery = query(
        notificationsRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      
      const globalNotificationsQuery = query(
        notificationsRef,
        where('userId', '==', 'all'),
        orderBy('createdAt', 'desc')
      );
      
      // Execute both queries
      const [userSnapshot, globalSnapshot] = await Promise.all([
        getDocs(userNotificationsQuery),
        getDocs(globalNotificationsQuery)
      ]);
      
      const fetchedNotifications: INotification[] = [];
      
      // Process user-specific notifications
      userSnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedNotifications.push({
          id: doc.id,
          title: data.title || '',
          message: data.message || data.body || '', // Support both field names
          type: data.type || 'info',
          createdAt: data.createdAt as Timestamp,
          read: data.read || false,
          userId: data.userId || '',
          sentBy: data.sentBy,
          sentByEmail: data.sentByEmail,
          chatGroup: data.chatGroup
        });
      });
      
      // Process global notifications
      globalSnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedNotifications.push({
          id: doc.id,
          title: data.title || '',
          message: data.message || data.body || '',
          type: data.type || 'announcement',
          createdAt: data.createdAt as Timestamp,
          read: data.read || false,
          userId: 'all', // Keep as 'all' to identify global notifications
          sentBy: data.sentBy,
          sentByEmail: data.sentByEmail,
          chatGroup: data.chatGroup
        });
      });
      
      // Sort all notifications by creation date (newest first)
      fetchedNotifications.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
      
      // Take only the 5 most recent for preview
      const recentNotifications = fetchedNotifications.slice(0, 5);
      setNotifications(recentNotifications);
      
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const fetchAllNotifications = async (userId: string) => {
    try {
      const notificationsRef = collection(db, 'notifications');
      
      // Create separate queries for user-specific and global notifications
      const userNotificationsQuery = query(
        notificationsRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      
      const globalNotificationsQuery = query(
        notificationsRef,
        where('userId', '==', 'all'),
        orderBy('createdAt', 'desc')
      );
      
      // Execute both queries
      const [userSnapshot, globalSnapshot] = await Promise.all([
        getDocs(userNotificationsQuery),
        getDocs(globalNotificationsQuery)
      ]);
      
      const fetchedNotifications: INotification[] = [];
      
      // Process user-specific notifications
      userSnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedNotifications.push({
          id: doc.id,
          title: data.title || '',
          message: data.message || data.body || '',
          type: data.type || 'info',
          createdAt: data.createdAt as Timestamp,
          read: data.read || false,
          userId: data.userId || '',
          sentBy: data.sentBy,
          sentByEmail: data.sentByEmail,
          chatGroup: data.chatGroup
        });
      });
      
      // Process global notifications
      globalSnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedNotifications.push({
          id: doc.id,
          title: data.title || '',
          message: data.message || data.body || '',
          type: data.type || 'announcement',
          createdAt: data.createdAt as Timestamp,
          read: data.read || false,
          userId: 'all',
          sentBy: data.sentBy,
          sentByEmail: data.sentByEmail,
          chatGroup: data.chatGroup
        });
      });
      
      // Sort all notifications by creation date (newest first)
      fetchedNotifications.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
      
      setAllNotifications(fetchedNotifications);
    } catch (error) {
      console.error('Error fetching all notifications:', error);
    }
  };

  // Filter notifications based on current filters
  const getFilteredNotifications = () => {
    let filtered = [...allNotifications];

    // Filter by read status
    if (notificationFilter === 'read') {
      filtered = filtered.filter(n => n.read);
    } else if (notificationFilter === 'unread') {
      filtered = filtered.filter(n => !n.read);
    }

    // Filter by type
    if (notificationTypeFilter !== 'all') {
      filtered = filtered.filter(n => n.type === notificationTypeFilter);
    }

    // Filter by search
    if (notificationSearch.trim()) {
      const searchLower = notificationSearch.toLowerCase();
      filtered = filtered.filter(n => 
        n.title.toLowerCase().includes(searchLower) ||
        n.message.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  };

  const markNotificationAsRead = async (notificationId: string) => {
    if (!currentUser) return;

    try {
      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, { read: true });

      // Update local state
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setAllNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );

      // Log activity
      recordActivityLog({
        action: "Marked Notification as Read",
        details: "User marked a notification as read",
        userId: currentUser.uid,
        userEmail: currentUser.email || undefined,
        category: "user",
        severity: "low",
        metadata: {
          notificationId: notificationId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!currentUser) return;

    try {
      const unreadNotifications = allNotifications.filter(n => !n.read);
      
      const updatePromises = unreadNotifications.map(notification => {
        const notificationRef = doc(db, 'notifications', notification.id);
        return updateDoc(notificationRef, { read: true });
      });

      await Promise.all(updatePromises);

      // Update local state
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setAllNotifications(prev => prev.map(n => ({ ...n, read: true })));

      // Log activity
      recordActivityLog({
        action: "Marked All Notifications as Read",
        details: `User marked ${unreadNotifications.length} notifications as read`,
        userId: currentUser.uid,
        userEmail: currentUser.email || undefined,
        category: "user",
        severity: "low",
        metadata: {
          notificationCount: unreadNotifications.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const handleViewAllNotifications = () => {
    setShowAllNotifications(true);

    // Log activity
    if (currentUser) {
      recordActivityLog({
        action: "Opened All Notifications View",
        details: "User opened the complete notifications panel",
        userId: currentUser.uid,
        userEmail: currentUser.email || undefined,
        category: "user",
        severity: "low",
        metadata: {
          totalNotifications: allNotifications.length,
          unreadCount: allNotifications.filter(n => !n.read).length,
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  useEffect(() => {
    if (showIdCard && userData) {
      const timer = setTimeout(() => {
        generateIdCardImage();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setGeneratedIdImage(null);
    }
  }, [showIdCard, userData, defaultProfilePicture]);

  const handleLogout = async () => {
    try {
      if (currentUser) {
        // Log logout activity
        recordActivityLog({
          action: "User Logged Out",
          details: "User logged out from their account",
          userId: currentUser.uid,
          userEmail: currentUser.email || undefined,
          category: "auth",
          severity: "low",
          metadata: {
            logoutTime: new Date().toISOString(),
            fromPage: "profile"
          }
        });
      }

      await signOut(auth);
      window.location.href = '/';
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];

      const maxSize = 2 * 1024 * 1024;
      if (file.size > maxSize) {
        alert("File size exceeds 2 MB. Please upload a smaller file.");
        event.target.value = "";
        return;
      }

      if (!file.type.startsWith('image/')) {
        alert("Please select a valid image file.");
        event.target.value = "";
        return;
      }

      if (!canChangePicture) {
        alert(`You can only change your profile picture every 3 months. Please wait ${daysLeft} more days.`);
        event.target.value = "";
        return;
      }

      // Clean up previous preview
      if (previewImage) {
        URL.revokeObjectURL(previewImage);
      }

      setSelectedImage(file);
      const imageUrl = URL.createObjectURL(file);
      setPreviewImage(imageUrl);
      setShowModal(true);

      // Log file selection
      if (currentUser) {
        recordActivityLog({
          action: "Selected Profile Picture",
          details: "User selected a new profile picture for upload",
          userId: currentUser.uid,
          userEmail: currentUser.email || undefined,
          category: "user",
          severity: "low",
          metadata: {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type
          }
        });
      }
    }
  };

  const handleConfirmChange = async () => {
    if (!selectedImage || !userDocId || !currentUser) return;

    try {
      const storage = getStorage();
      const timestamp = Date.now();
      const sanitizedFileName = selectedImage.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storageRef = ref(storage, `adminUsers/${userDocId}_${timestamp}_${sanitizedFileName}`);

      await uploadBytes(storageRef, selectedImage);
      const downloadURL = await getDownloadURL(storageRef);

      const userRef = doc(db, 'adminUsers', userDocId);
      await updateDoc(userRef, {
        profilePictureUrl: downloadURL,
        lastProfileUpload: Timestamp.now(),
      });

      setDefaultProfilePicture(downloadURL);
      setCanChangePicture(false);
      setDaysLeft(90);

      // Log successful upload
      recordActivityLog({
        action: "Updated Profile Picture",
        details: "User successfully updated their profile picture",
        userId: currentUser.uid,
        userEmail: currentUser.email || undefined,
        category: "user",
        severity: "medium",
        metadata: {
          fileName: selectedImage.name,
          fileSize: selectedImage.size,
          storageUrl: downloadURL,
          nextAllowedChange: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
        }
      });

      // Clean up and close modal
      handleCancelChange();

      alert('Profile picture updated successfully!');
    } catch (error) {
      console.error('Error uploading image:', error);
      
      // Log error
      if (currentUser) {
        recordActivityLog({
          action: "Profile Picture Update Failed",
          details: "Failed to update profile picture",
          userId: currentUser.uid,
          userEmail: currentUser.email || undefined,
          category: "user",
          severity: "high",
          metadata: {
            error: error instanceof Error ? error.message : 'Unknown error',
            fileName: selectedImage.name
          }
        });
      }

      alert('Failed to update profile picture. Please try again.');
    }
  };

  const handleCancelChange = () => {
    if (previewImage) {
      URL.revokeObjectURL(previewImage);
    }
    setSelectedImage(null);
    setPreviewImage(null);
    setShowModal(false);
  };

  const handleShowIdCard = () => {
    setShowIdCard(true);
    setGeneratedIdImage(null);

    // Log ID card view
    if (currentUser) {
      recordActivityLog({
        action: "Viewed ID Card",
        details: "User opened their digital ID card",
        userId: currentUser.uid,
        userEmail: currentUser.email || undefined,
        category: "user",
        severity: "low",
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  const handleCloseIdCard = () => {
    setShowIdCard(false);
    setGeneratedIdImage(null);
  };

  const formatBirthday = (birthday: string) => {
    if (!birthday) return '';
    try {
      const date = new Date(birthday);
      if (isNaN(date.getTime())) return birthday;
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting birthday:', error);
      return birthday;
    }
  };

  const generateIdCardImage = async () => {
    try {
      const html2canvas = (await import('html2canvas')).default;
      const idCardElement = document.getElementById('id-card-download');
      if (!idCardElement) {
        throw new Error('ID card element not found');
      }

      // Wait for all images to load
      const images = idCardElement.querySelectorAll('img');
      const imagePromises = Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Image load timeout')), 10000);
          img.onload = () => {
            clearTimeout(timeout);
            resolve();
          };
          img.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Image failed to load'));
          };
        });
      });

      await Promise.all(imagePromises);

      const canvas = await html2canvas(idCardElement, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: false,
        foreignObjectRendering: true,
        width: idCardElement.offsetWidth,
        height: idCardElement.offsetHeight,
        scrollX: 0,
        scrollY: 0,
      });

      const dataUrl = canvas.toDataURL('image/png', 1.0);
      setGeneratedIdImage(dataUrl);
      
    } catch (error) {
      console.error('Error generating ID card image:', error);
      alert('Failed to generate ID card image. Please try again.');
    }
  };
  
  const downloadIdCardImage = () => {
    if (!generatedIdImage || !userData || !currentUser) {
      alert('Please wait for the ID card image to be generated first');
      return;
    }

    try {
      const link = document.createElement('a');
      const sanitizedName = userData.name.replace(/[^a-zA-Z0-9]/g, '_');
      link.download = `${sanitizedName}_SK_ID_Card.png`;
      link.href = generatedIdImage;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Log ID card download
      recordActivityLog({
        action: "Downloaded ID Card",
        details: "User downloaded their digital ID card image",
        userId: currentUser.uid,
        userEmail: currentUser.email || undefined,
        category: "user",
        severity: "low",
        metadata: {
          fileName: `${sanitizedName}_SK_ID_Card.png`,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error('Error downloading image:', error);
      alert('Failed to download image. Please try again.');
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'announcement':
        return '📢';
      case 'warning':
        return '⚠️';
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'system':
        return '⚙️';
      case 'admin':
        return '👨‍💼';
      default:
        return '📝';
    }
  };

  const formatNotificationDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInDays === 1) {
      return 'Yesterday';
    } else if (diffInDays < 7) {
      return `${diffInDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const filteredNotifications = getFilteredNotifications();

  return (
    <RequireAuth>
      {loading ? (
        <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-[#1167B1] mx-auto mb-4"></div>
            <h2 className="text-2xl font-bold text-[#1167B1]">Loading Profile...</h2>
          </div>
        </div>
      ) : !userData ? (
        <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">User not found.</h2>
            <button
              onClick={() => window.location.reload()}
              className="bg-[#1167B1] hover:bg-[#0d4c8b] text-white px-6 py-2 rounded-md transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      ) : (
        <div className="ml-[260px] min-h-screen bg-[#e7f0fa] p-8 overflow-auto">
          {/* Greeting Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-xl text-gray-700">Kamusta!</h2>
              <h1 className="text-4xl font-bold text-[#1167B1]">{userData.name}</h1>
            </div>
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-md shadow-md text-lg transition-colors"
            >
              Logout
            </button>
          </div>

          {/* Main Layout */}
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Profile Card */}
            <div className="bg-white rounded-lg shadow-lg p-6 flex flex-col items-center w-full lg:w-1/3 relative">
              <div className="relative group">
                <div className="w-80 h-80 rounded-lg shadow-md overflow-hidden border">
                  <Image
                    src={defaultProfilePicture}
                    alt="Profile"
                    width={320}
                    height={320}
                    className="w-full h-full object-cover"
                    priority
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = '/ExampleProfile.png';
                    }}
                  />
                </div>

                {canChangePicture ? (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <Image src="/ImageUpload.svg" alt="Upload Icon" width={40} height={40} />
                    </label>
                    <input
                      id="file-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="bg-gray-700 text-white text-xs px-2 py-1 rounded-md shadow">
                      ⏳ {daysLeft} days left
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-6 text-center">
                <h2 className="text-2xl font-bold text-[#1167B1] uppercase">{userData.name}</h2>
                <p className="text-md font-semibold">{userData.skId}</p>
                <p className="text-2xl font-semibold mt-4 text-[#1167B1]">{userData.position}</p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-6 w-full">
                <button 
                  onClick={handleShowIdCard}
                  className="flex-1 h-12 rounded-md bg-[#004AAD] text-white font-semibold text-base hover:bg-[#003a8c] transition-colors"
                >
                  ID Card
                </button>
                <a
                  href="/user/Security"
                  className="flex-1 h-12 flex items-center justify-center rounded-md bg-[#E11D48] text-white font-semibold text-base hover:bg-[#be1242] transition-colors"
                >
                  Security
                </a>
                <a
                  href="/user/ActivityLog"
                  className="flex-1 h-12 flex items-center justify-center rounded-md bg-[#FACC15] text-black font-semibold text-base hover:bg-[#eab308] transition-colors"
                >
                  Activity Log
                </a>
              </div>
            </div>

            {/* Right Section */}
            <div className="flex flex-col gap-8 w-full lg:w-2/3">
              {/* Personal Info */}
              <div className="bg-white rounded-lg shadow-lg">
                <h3 className="bg-[#1167B1] text-white px-5 py-3 rounded-t-lg font-semibold text-lg">
                  PERSONAL INFORMATION
                </h3>
                <div className="p-6 text-gray-700 text-base space-y-3">
                  <p><strong>Barangay:</strong> {userData.barangay}</p>
                  <p><strong>Gender:</strong> {userData.gender}</p>
                  <p><strong>Email:</strong> {userData.email}</p>
                  <p><strong>Birthday:</strong> {formatBirthday(userData.birthday)}</p>
                  <p><strong>Civil Status:</strong> {userData.civilStatus}</p>
                  <p><strong>Phone Number:</strong> {userData.phoneNumber}</p>
                </div>
              </div>

              {/* Notifications Panel */}
              <div className="bg-white rounded-lg shadow-lg">
                <div className="flex justify-between items-center bg-[#1167B1] text-white px-5 py-3 rounded-t-lg">
                  <h3 className="font-semibold text-lg">RECENT NOTIFICATIONS</h3>
                  <span className="bg-white text-[#1167B1] text-sm font-semibold px-2 py-1 rounded-full">
                    {notifications.filter(n => !n.read).length}
                  </span>
                </div>
                <div className="p-4 max-h-96 overflow-y-auto">
                  {notifications.length > 0 ? (
                    <div className="space-y-3">
                      {notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`p-4 rounded-lg border-l-4 cursor-pointer transition-colors ${
                            notification.read 
                              ? 'bg-gray-50 border-gray-300 hover:bg-gray-100' 
                              : 'bg-blue-50 border-blue-500 hover:bg-blue-100'
                          }`}
                          onClick={() => !notification.read && markNotificationAsRead(notification.id)}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-lg flex-shrink-0 mt-1">
                              {getNotificationIcon(notification.type)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className={`font-medium text-sm ${
                                  notification.read ? 'text-gray-700' : 'text-gray-900'
                                }`}>
                                  {notification.title}
                                </h4>
                                <span className="text-xs text-gray-500 flex-shrink-0">
                                  {formatNotificationDate(notification.createdAt)}
                                </span>
                              </div>
                              <p className={`text-sm mt-1 ${
                                notification.read ? 'text-gray-600' : 'text-gray-800'
                              }`}>
                                {notification.message}
                              </p>
                              {!notification.read && (
                                <div className="mt-2">
                                  <span className="inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
                                  <span className="text-xs text-blue-600 ml-2">New</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="text-gray-400 text-4xl mb-3">🔔</div>
                      <p className="text-gray-500">No notifications yet</p>
                    </div>
                  )}
                </div>
                {allNotifications.length > 0 && (
                  <div className="border-t px-5 py-3">
                    <button 
                      onClick={handleViewAllNotifications}
                      className="text-[#1167B1] text-sm font-medium hover:underline"
                    >
                      View All Notifications ({allNotifications.length})
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* All Notifications Modal */}
          {showAllNotifications && (
            <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
                <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-[#1167B1] text-white">
                  <h2 className="text-2xl font-bold">All Notifications</h2>
                  <div className="flex items-center gap-4">
                    <span className="text-sm bg-white text-[#1167B1] px-2 py-1 rounded-full font-semibold">
                      {allNotifications.filter(n => !n.read).length} unread
                    </span>
                    <button
                      onClick={() => setShowAllNotifications(false)}
                      className="text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-white hover:bg-opacity-20 transition-colors"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {/* Filters */}
                <div className="p-4 border-b bg-gray-50">
                  <div className="flex flex-wrap gap-4 items-center">
                    {/* Search */}
                    <div className="flex-1 min-w-[200px]">
                      <input
                        type="text"
                        placeholder="Search notifications..."
                        value={notificationSearch}
                        onChange={(e) => setNotificationSearch(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1167B1]"
                      />
                    </div>

                    {/* Read Status Filter */}
                    <select
                      value={notificationFilter}
                      onChange={(e) => setNotificationFilter(e.target.value as 'all' | 'unread' | 'read')}
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1167B1]"
                    >
                      <option value="all">All ({allNotifications.length})</option>
                      <option value="unread">Unread ({allNotifications.filter(n => !n.read).length})</option>
                      <option value="read">Read ({allNotifications.filter(n => n.read).length})</option>
                    </select>

                    {/* Type Filter */}
                    <select
                      value={notificationTypeFilter}
                      onChange={(e) => setNotificationTypeFilter(e.target.value as 'all' | 'announcement' | 'system' | 'admin')}
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1167B1]"
                    >
                      <option value="all">All Types</option>
                      <option value="announcement">📢 Announcements</option>
                      <option value="system">⚙️ System</option>
                      <option value="admin">👨‍💼 Admin</option>
                    </select>

                    {/* Mark All as Read */}
                    {allNotifications.some(n => !n.read) && (
                      <button
                        onClick={markAllAsRead}
                        className="px-4 py-2 bg-[#1167B1] text-white rounded-md text-sm hover:bg-[#0d4c8b] transition-colors"
                      >
                        Mark All Read
                      </button>
                    )}
                  </div>
                </div>

                {/* Notifications List */}
                <div className="p-4 max-h-[60vh] overflow-y-auto">
                  {filteredNotifications.length > 0 ? (
                    <div className="space-y-3">
                      {filteredNotifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`p-4 rounded-lg border-l-4 cursor-pointer transition-colors ${
                            notification.read 
                              ? 'bg-gray-50 border-gray-300 hover:bg-gray-100' 
                              : 'bg-blue-50 border-blue-500 hover:bg-blue-100'
                          }`}
                          onClick={() => !notification.read && markNotificationAsRead(notification.id)}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-lg flex-shrink-0 mt-1">
                              {getNotificationIcon(notification.type)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className={`font-medium text-sm ${
                                  notification.read ? 'text-gray-700' : 'text-gray-900'
                                }`}>
                                  {notification.title}
                                </h4>
                                <span className="text-xs text-gray-500 flex-shrink-0">
                                  {formatNotificationDate(notification.createdAt)}
                                </span>
                              </div>
                              <p className={`text-sm mt-1 ${
                                notification.read ? 'text-gray-600' : 'text-gray-800'
                              }`}>
                                {notification.message}
                              </p>
                              {notification.chatGroup && (
                                <p className="text-xs text-gray-500 mt-1">
                                  From: {notification.chatGroup}
                                </p>
                              )}
                              {!notification.read && (
                                <div className="mt-2 flex items-center">
                                  <span className="inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
                                  <span className="text-xs text-blue-600 ml-2">New</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-gray-400 text-6xl mb-4">🔍</div>
                      <h3 className="text-lg font-medium text-gray-700 mb-2">No notifications found</h3>
                      <p className="text-gray-500">
                        {notificationSearch || notificationFilter !== 'all' || notificationTypeFilter !== 'all'
                          ? 'Try adjusting your filters'
                          : 'You have no notifications yet'
                        }
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="border-t p-4 bg-gray-50 text-center text-sm text-gray-600">
                  Showing {filteredNotifications.length} of {allNotifications.length} notifications
                </div>
              </div>
            </div>
          )}

          {/* Profile Picture Modal */}
          {showModal && (
            <div className="fixed inset-0 bg-black bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-[#e7f0fa] rounded-2xl w-[450px] p-6 shadow-lg flex flex-col items-center border-2 border-[#0A2F7A]">
                <h2 className="text-2xl font-bold text-[#0A2F7A] mb-2">Change Profile Picture</h2>
                <p className="text-gray-700 text-sm mb-4 text-center">
                  Are you sure you want to change your profile picture? You can only change your profile picture once every 3 months.
                </p>
                <div className="w-56 h-56 bg-gray-300 rounded-lg mb-6 flex items-center justify-center overflow-hidden">
                  {previewImage ? (
                    <Image
                      src={previewImage}
                      alt="Selected Preview"
                      width={224}
                      height={224}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-gray-500">No image selected</span>
                  )}
                </div>
                <div className="flex w-full gap-2">
                  <button
                    onClick={handleCancelChange}
                    className="flex-1 py-3 bg-gray-300 text-black font-semibold rounded-lg hover:bg-gray-400 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmChange}
                    className="flex-1 py-3 bg-[#1167B1] text-white font-semibold rounded-lg hover:bg-[#0d4c8b] transition-colors"
                  >
                    Proceed
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ID Card Modal */}
          {showIdCard && (
            <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-auto">
                <div className="flex justify-between items-center p-6 border-b border-gray-200">
                  <h2 className="text-2xl font-bold text-[#1167B1]">Official ID Card</h2>
                  <button
                    onClick={handleCloseIdCard}
                    className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                  >
                    ×
                  </button>
                </div>
                <div className="p-6">
                  <div 
                    id="id-card-download"
                    className="relative rounded-2xl shadow-2xl overflow-hidden mx-auto max-w-4xl" 
                    style={{aspectRatio: '1.6/1'}}
                  >
                    <div className="absolute inset-0">
                      <Image
                        src="/SK Marikina ID.png"
                        alt="SK ID Background"
                        fill
                        className="object-cover"
                        priority
                      />
                    </div>
                    <div className="relative z-10 p-8 h-full flex items-center">
                      <div className="flex gap-6 items-start w-full mt-4">
                        <div className="flex-shrink-0">
                          <div className="w-64 h-72 border-2 border-gray-400 rounded-lg overflow-hidden bg-gray-100 shadow-lg relative">
                            <Image
                              src={defaultProfilePicture}
                              alt="Profile"
                              fill
                              className="object-cover"
                            />
                          </div>
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="mb-3">
                            <h4 className="text-4xl font-bold text-[#002C84] uppercase tracking-wide italic">
                              {userData.name}
                            </h4>
                          </div>
                          <div className="space-y-1.5 text-base">
                            <div className="flex items-center gap-4">
                              <p className="font-bold text-[#002C84] w-48 whitespace-nowrap">SK ID</p>
                              <p className="text-gray-800 font-medium">{userData.skId}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <p className="font-bold text-[#002C84] w-48 whitespace-nowrap">POSITION</p>
                              <p className="text-gray-800 font-medium">{userData.position}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <p className="font-bold text-[#002C84] w-48 whitespace-nowrap">EMAIL</p>
                              <p className="text-gray-800 font-medium">{userData.email}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <p className="font-bold text-[#002C84] w-48 whitespace-nowrap">BARANGAY</p>
                              <p className="text-gray-800 font-medium">{userData.barangay}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <p className="font-bold text-[#002C84] w-48 whitespace-nowrap">GENDER</p>
                              <p className="text-gray-800 font-medium">{userData.gender}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <p className="font-bold text-[#002C84] w-48 whitespace-nowrap">BIRTHDAY</p>
                              <p className="text-gray-800 font-medium">{formatBirthday(userData.birthday)}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <p className="font-bold text-[#002C84] w-48 whitespace-nowrap">STATUS</p>
                              <p className="text-gray-800 font-medium whitespace-nowrap">{userData.civilStatus}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <p className="font-bold text-[#002C84] w-48 whitespace-nowrap">CONTACT NUMBER</p>
                              <p className="text-gray-800 font-medium whitespace-nowrap">{userData.phoneNumber}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="absolute bottom-8 left-0 right-0 flex justify-center">
                        <p className="text-sm font-bold text-[#002C84] italic ml-2">VALID UNTIL NOVEMBER 2026</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 flex justify-center gap-4">
                    <button
                      onClick={downloadIdCardImage}
                      disabled={!generatedIdImage}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2"
                    >
                      <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd"/>
                      </svg>
                      {generatedIdImage ? 'Download Picture' : 'Generating...'}
                    </button>
                    
                    <button
                      onClick={handleCloseIdCard}
                      className="bg-[#1167B1] hover:bg-[#0d4c8b] text-white px-8 py-3 rounded-lg font-semibold transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <Navbar />
        </div>
      )}
    </RequireAuth>
  );
}
