'use client';

import React, { useState, useEffect, ChangeEvent } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, Timestamp, orderBy, limit } from 'firebase/firestore';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { db, auth } from '@/app/Firebase/firebase';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Navbar from '../Components/Navbar';
import RequireAuth from '../Components/RequireAuth';
import Image from 'next/image';

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
  body: string;
  type: string;
  createdAt: Timestamp;
  read: boolean;
  userId: string;
}

export default function UserProfile() {
  const [userData, setUserData] = useState<IUserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [defaultProfilePicture, setDefaultProfilePicture] = useState('/ExampleProfile.png');
  const [notifications, setNotifications] = useState<INotification[]>([]);
  const [, setCurrentUser] = useState<User | null>(null);

  // Modal states
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showIdCard, setShowIdCard] = useState(false);
  const [generatedIdImage, setGeneratedIdImage] = useState<string | null>(null);

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
      const q = query(
        notificationsRef,
        where('userId', 'in', [userId, 'all']),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      
      const querySnapshot = await getDocs(q);
      const fetchedNotifications: INotification[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedNotifications.push({
          id: doc.id,
          title: data.title || '',
          body: data.body || '',
          type: data.type || 'info',
          createdAt: data.createdAt as Timestamp,
          read: data.read || false,
          userId: data.userId || ''
        });
      });
      
      setNotifications(fetchedNotifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
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
    }
  };

  const handleConfirmChange = async () => {
    if (!selectedImage || !userDocId) return;

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

      // Clean up and close modal
      handleCancelChange();

      alert('Profile picture updated successfully!');
    } catch (error) {
      console.error('Error uploading image:', error);
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
    if (!generatedIdImage || !userData) {
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
                <div className="p-4 max-h-96 overflow-y-scroll">
                  {notifications.length > 0 ? (
                  <div className="space-y-3">
                    {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 rounded-lg border-l-4 ${
                      notification.read 
                        ? 'bg-gray-300 border-gray-300' 
                        : 'bg-blue-50 border-blue-500'
                      }`}
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
                        {notification.body}
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
                </div>
            </div>
          </div>

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
