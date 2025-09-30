"use client";

import { useState, useEffect, Suspense } from 'react';
import { db } from "@/app/Firebase/firebase";
import { collection, getDocs, query, where, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import Navbar from "../../Components/Navbar";
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import RequireAuth from "@/app/Components/RequireAuth";
import { getAuth, User } from "firebase/auth";
import { recordActivityLog } from "@/app/Components/recordActivityLog";

// Email configuration
const EMAIL_CONFIG = {
  GMAIL_USER: 'skcentralsystem@gmail.com',
  GMAIL_APP_PASSWORD: 'awis lkif bgih hclg',
};

interface EmailData {
  to: string;
  subject: string;
  html: string;
}

// Email sending function
const sendEmailDirectly = async (emailData: EmailData) => {
  try {
    if (!EMAIL_CONFIG.GMAIL_USER ||
        !EMAIL_CONFIG.GMAIL_APP_PASSWORD ||
        EMAIL_CONFIG.GMAIL_USER.trim() === '' ||
        EMAIL_CONFIG.GMAIL_APP_PASSWORD.trim() === '' ||
        !EMAIL_CONFIG.GMAIL_USER.includes('@') ||
        EMAIL_CONFIG.GMAIL_APP_PASSWORD.length < 16) {
      throw new Error('Gmail credentials not configured properly in EMAIL_CONFIG.');
    }

    console.log('📧 Sending email notification to organization:');
    console.log('From:', EMAIL_CONFIG.GMAIL_USER);
    console.log('To:', emailData.to);
    console.log('Subject:', emailData.subject);

    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_CONFIG.GMAIL_USER,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        gmailUser: EMAIL_CONFIG.GMAIL_USER,
        gmailPassword: EMAIL_CONFIG.GMAIL_APP_PASSWORD,
      }),
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const htmlText = await response.text();
      console.error('❌ API returned HTML instead of JSON:', htmlText.substring(0, 200));
      throw new Error('API route not found or returning HTML. Please ensure /api/send-email/route.ts exists.');
    }

    const result = await response.json();

    if (!response.ok) {
      let errorMessage = result.error || 'Failed to send email';
      if (result.details) {
        errorMessage += ` (${result.details})`;
      }
      console.error('❌ API Error Response:', result);
      throw new Error(errorMessage);
    }

    console.log('✅ Email sent successfully via API');
    
    return {
      success: true,
      messageId: result.messageId || 'email_' + Date.now(),
      message: result.message || `Email notification sent successfully to ${emailData.to}`
    };

  } catch (error) {
    console.error('❌ Email sending error:', error);
    throw error;
  }
};

interface Applicant {
  id: string;
  name: string;
  phone: string;
  email: string;
  certificate: {
    corFileName: string;
    reportCardFileName: string;
  };
  status: string;
}

interface Scholarship {
  id: string;
  title?: string;
  scholarshipName?: string;
  companyEmail?: string;
  providerEmail?: string;
  [key: string]: unknown;
}

// Component that uses useSearchParams
function ScholarshipListingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedScholarshipId, setSelectedScholarshipId] = useState<string>('');
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);

  const [organizationEmail, setOrganizationEmail] = useState<string>('');
  const [scholarshipName, setScholarshipName] = useState<string>('');
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [loading, setLoading] = useState(false);

  // Initialize authentication
  const auth = getAuth();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        // Log page access with specific page name
        await recordActivityLog({
          action: "View Page",
          details: "User accessed the Scholarship Listing Applicants page",
          userId: currentUser.uid,
          userEmail: currentUser.email || undefined,
          category: "user",
        });
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, [auth]);

  // Send notification to all users
  const sendNotificationToAllUsers = async (title: string, body: string, type: string = "scholarship") => {
    try {
      await addDoc(collection(db, "notifications"), {
        userId: "all",
        type,
        title,
        body,
        createdAt: serverTimestamp(),
        read: false,
      });
    } catch (error) {
      console.error("Error sending notification:", error);
    }
  };

  // Email configuration validation
  const isEmailConfigured = EMAIL_CONFIG.GMAIL_USER && 
                           EMAIL_CONFIG.GMAIL_APP_PASSWORD &&
                           EMAIL_CONFIG.GMAIL_USER.trim() !== '' &&
                           EMAIL_CONFIG.GMAIL_APP_PASSWORD.trim() !== '' &&
                           EMAIL_CONFIG.GMAIL_USER.includes('@') &&
                           EMAIL_CONFIG.GMAIL_APP_PASSWORD.length >= 16;

  useEffect(() => {
    if (!isEmailConfigured) {
      console.warn('⚠️ Gmail configuration not set properly. Please update EMAIL_CONFIG at the top of the file.');
    } else {
      console.log('✅ Gmail configuration is properly set');
    }
  }, [isEmailConfigured]);

  // Fetch scholarships from Firebase Firestore
  useEffect(() => {
    const fetchScholarships = async () => {
      try {
        console.log('Fetching scholarships...');
        const scholarshipsSnapshot = await getDocs(collection(db, 'scholarships'));
        const scholarshipsList = scholarshipsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Scholarship[];
        
        console.log('Scholarships fetched:', scholarshipsList);
        setScholarships(scholarshipsList);
      } catch (error) {
        console.error('Error fetching scholarships:', error);
      }
    };

    fetchScholarships();
  }, []);

  // Handle scholarship selection from URL params
  useEffect(() => {
    const scholarshipId = searchParams.get('scholarshipId');
    if (scholarshipId && scholarships.length > 0) {
      console.log('Setting scholarship from URL params:', scholarshipId);
      const selected = scholarships.find((s) => s.id === scholarshipId);
      if (selected) {
        setSelectedScholarshipId(scholarshipId);
        
        // Try different field names for email and scholarship name
        const email = selected.companyEmail || selected.providerEmail || '';
        const name = selected.title || selected.scholarshipName || '';
        
        setOrganizationEmail(email);
        setScholarshipName(name);
        console.log('Selected scholarship:', {
          id: scholarshipId,
          email,
          name,
          fullData: selected
        });
      }
    }
  }, [searchParams, scholarships]);

  // Fetch scholarship applicants
  useEffect(() => {
    const fetchApplicants = async () => {
      if (!selectedScholarshipId || !scholarshipName) {
        console.log("No scholarship selected, clearing applicants");
        setApplicants([]);
        return;
      }

      setLoading(true);
      console.log("Fetching applicants for scholarship:", scholarshipName);

      try {
        const scholarshipApplicantsRef = collection(db, "scholarshipApplicants");
        
        // Match by scholarshipName first
        let applicantsQuery = query(
          scholarshipApplicantsRef,
          where("scholarshipName", "==", scholarshipName)
        );
        let applicantsSnapshot = await getDocs(applicantsQuery);

        // If no results, try matching by scholarship title
        if (applicantsSnapshot.empty) {
          const currentScholarship = scholarships.find(s => s.id === selectedScholarshipId);
          const titleToMatch = currentScholarship?.title || currentScholarship?.scholarshipName || scholarshipName;
          
          if (titleToMatch && titleToMatch !== scholarshipName) {
            applicantsQuery = query(
              scholarshipApplicantsRef,
              where("scholarshipName", "==", titleToMatch)
            );
            applicantsSnapshot = await getDocs(applicantsQuery);
          }
        }

        // If still no results, try matching by scholarshipId
        if (applicantsSnapshot.empty) {
          applicantsQuery = query(
            scholarshipApplicantsRef,
            where("scholarshipId", "==", selectedScholarshipId)
          );
          applicantsSnapshot = await getDocs(applicantsQuery);
        }

        if (applicantsSnapshot.empty) {
          console.log("No applicants found for scholarship:", scholarshipName);
          setApplicants([]);
          setLoading(false);
          return;
        }

        // Fetch all ApprovedUsers
        const approvedUsersRef = collection(db, "ApprovedUsers");
        const approvedUsersSnapshot = await getDocs(approvedUsersRef);

        // Map approved users by uid
        interface ApprovedUser {
          uid: string;
          firstName?: string;
          middleName?: string;
          lastName?: string;
          contact?: string;
          phone?: string;
          phoneNumber?: string;
          email?: string;
        }
        const approvedUsersMap = new Map<string, ApprovedUser>();
        approvedUsersSnapshot.docs.forEach((doc) => {
          const userData = doc.data();
          if (userData.uid) {
            approvedUsersMap.set(userData.uid, {
              uid: userData.uid,
              firstName: userData.firstName,
              middleName: userData.middleName,
              lastName: userData.lastName,
              contact: userData.contact,
              phone: userData.phone,
              phoneNumber: userData.phoneNumber,
              email: userData.email,
            });
          }
        });

        // Build applicants list
        const applicantsList: Applicant[] = applicantsSnapshot.docs.map((doc) => {
          const applicantData = doc.data();
          const applicantUid = applicantData.uid || "";
          const userData = approvedUsersMap.get(applicantUid);

          if (userData) {
            const fullName = [
              userData.firstName || "",
              userData.middleName || "",
              userData.lastName || "",
            ]
              .filter((name) => name.trim())
              .join(" ")
              .trim();

            return {
              id: doc.id,
              name: fullName || "N/A",
              phone: userData.contact || userData.phone || userData.phoneNumber || "N/A",
              email: userData.email || "N/A",
              certificate: {
                corFileName: applicantData.corFileName || applicantData.certificateUrl || "",
                reportCardFileName: applicantData.reportCardFileName || applicantData.credentialsUrl || "",
              },
              status: applicantData.status || "Pending",
            };
          } else {
            return {
              id: doc.id,
              name: applicantData.name || applicantData.fullName || "User not found",
              phone: applicantData.phone || applicantData.contact || "N/A",
              email: applicantData.email || applicantData.userEmail || "N/A",
              certificate: {
                corFileName: applicantData.corFileName || applicantData.certificateUrl || "",
                reportCardFileName: applicantData.reportCardFileName || applicantData.credentialsUrl || "",
              },
              status: applicantData.status || "Pending",
            };
          }
        });

        setApplicants(applicantsList);
      } catch (error) {
        console.error("Error fetching applicants:", error);
        setApplicants([]);
      } finally {
        setLoading(false);
      }
    };

    fetchApplicants();
  }, [scholarshipName, selectedScholarshipId, scholarships]);

  // 📧 EMAIL FUNCTIONS
  const handleSendEmail = (applicant: Applicant) => {
    if (!organizationEmail) {
      alert('⚠️ Organization email not found. Please ensure the scholarship has a valid organization email.');
      return;
    }

    if (!isEmailConfigured) {
      alert('⚠️ Email service not configured. Please set up Gmail credentials in EMAIL_CONFIG at the top of the file.');
      return;
    }

    setSelectedApplicant(applicant);
    
    // Email subject for the organization notification
    setEmailSubject(`New Scholarship Application Update - ${applicant.name} for ${scholarshipName}`);
    
    // Email message for the organization
    setEmailMessage(
      `Dear Scholarship Committee,

We wanted to notify you about an update regarding the scholarship application from ${applicant.name} for the ${scholarshipName} scholarship.

Applicant Details:
- Name: ${applicant.name}
- Email: ${applicant.email}
- Phone: ${applicant.phone}
- Current Status: ${applicant.status}

This notification is to inform you that there has been an update to this applicant's status or that action may be required on your part.

You can review the full application details in your scholarship management dashboard.

Best regards,
SK Central System
Automated Notification System`
    );
    
    setShowEmailModal(true);
  };

  const sendEmail = async () => {
    if (!selectedApplicant || !emailSubject.trim() || !organizationEmail) {
      alert('Please fill in all required fields and ensure organization email is available.');
      return;
    }

    if (!isEmailConfigured) {
      alert('Gmail configuration is not set up properly. Please configure EMAIL_CONFIG at the top of the file.');
      return;
    }

    setIsEmailSending(true);

    try {
      // Create HTML email content
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #002C84; color: white; padding: 20px; text-align: center;">
            <h1>SK Central System</h1>
            <h2>Scholarship Application Update Notification</h2>
          </div>
          
          <div style="padding: 20px; background-color: #f9f9f9;">
            <h3 style="color: #002C84;">Scholarship Application Update</h3>
            
            <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 10px 0;">
              <h4 style="color: #1167B1; margin-top: 0;">Applicant Information</h4>
              <p><strong>Name:</strong> ${selectedApplicant.name}</p>
              <p><strong>Email:</strong> ${selectedApplicant.email}</p>
              <p><strong>Phone:</strong> ${selectedApplicant.phone}</p>
              <p><strong>Scholarship Applied:</strong> ${scholarshipName}</p>
              <p><strong>Current Status:</strong> ${selectedApplicant.status}</p>
            </div>
            
            <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 10px 0;">
              <h4 style="color: #1167B1; margin-top: 0;">Message</h4>
              <p style="white-space: pre-wrap;">${emailMessage}</p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
              <p style="color: #666; font-size: 12px;">
                This is an automated notification from SK Central System.<br>
                Please do not reply to this email.
              </p>
            </div>
          </div>
        </div>
      `;

      const result = await sendEmailDirectly({
        to: organizationEmail,
        subject: emailSubject,
        html: htmlContent,
      });

      if (result.success) {
        alert(`✅ Email notification sent successfully to organization (${organizationEmail})!`);
        setShowEmailModal(false);
        setSelectedApplicant(null);
        setEmailSubject('');
        setEmailMessage('');

        // Send notification to all users
        await sendNotificationToAllUsers(
          "Email Notification Sent",
          `An email notification was sent to ${organizationEmail} regarding applicant ${selectedApplicant.name} for scholarship ${scholarshipName}`,
          "email"
        );

        // Log activity
        if (user) {
          await recordActivityLog({
            action: 'Send Email Notification',
            details: `Sent email notification to ${organizationEmail} about applicant ${selectedApplicant.name} for scholarship ${scholarshipName}`,
            userId: user.uid,
            userEmail: user.email || undefined,
            category: 'user',
          });
        }
      } else {
        alert(`❌ Failed to send email: ${result.message}`);
      }
    } catch (error: unknown) {
      console.error('Error sending email:', error);
      
      // Provide specific error messages
      let errorMessage = error instanceof Error ? error.message : String(error);
      if (error instanceof Error && error.message.includes('API route not found')) {
        errorMessage = 'API route not found. Please create the file: app/api/send-email/route.ts';
      } else if (error instanceof Error && error.message.includes('Gmail credentials not configured')) {
        errorMessage = 'Please update EMAIL_CONFIG with your Gmail credentials at the top of this file.';
      }
      
      alert(`❌ Failed to send email: ${errorMessage}`);
    } finally {
      setIsEmailSending(false);
    }
  };

  const handleStatusChange = async (index: number, newStatus: string) => {
    try {
      const applicant = applicants[index];
      console.log('Updating status for applicant:', applicant.id, 'to:', newStatus);

      // Update the status in Firebase
      const applicantRef = collection(db, 'scholarshipApplicants');
      const applicantQuery = query(applicantRef, where('email', '==', applicant.email));
      const applicantSnapshot = await getDocs(applicantQuery);

      if (applicantSnapshot.docs.length > 0) {
        const docRef = applicantSnapshot.docs[0].ref;
        await updateDoc(docRef, { status: newStatus });
        console.log('Status updated successfully in Firebase');
      }

      // Update local state
      const updatedApplicants = [...applicants];
      updatedApplicants[index].status = newStatus;
      setApplicants(updatedApplicants);

      // Send notification to all users
      await sendNotificationToAllUsers(
        "Applicant Status Updated",
        `The status of ${applicant.name} for scholarship ${scholarshipName} has been updated to ${newStatus}`,
        "scholarship"
      );

      // Log activity
      if (user) {
        await recordActivityLog({
          action: 'Update Applicant Status',
          details: `Updated status of ${applicant.name} to ${newStatus} for scholarship ${scholarshipName}`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'user',
        });
      }

    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status. Please try again.');
    }
  };

  const handleDownload = (fileName: string) => {
    if (fileName && fileName.trim()) {
      try {
        const downloadUrl = fileName.startsWith('http') 
          ? fileName 
          : `${fileName}`;
        
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = fileName.split('/').pop() || 'document.pdf';
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('Download initiated for:', downloadUrl);
      } catch (error) {
        console.error('Download error:', error);
        alert('Unable to download file. The file might not be available.');
      }
    } else {
      console.warn("No file name provided for download.");
      alert('No file available for download.');
    }
  };

  const handleReset = () => {
    setSelectedScholarshipId('');
    setOrganizationEmail('');
    setScholarshipName('');
    setApplicants([]);
  };

  const handleScholarshipChange = (scholarshipId: string) => {
    console.log('Scholarship selection changed to:', scholarshipId);
    setSelectedScholarshipId(scholarshipId);
    
    if (scholarshipId) {
      const selected = scholarships.find((s) => s.id === scholarshipId);
      if (selected) {
        setOrganizationEmail(selected.providerEmail || '');
        setScholarshipName(selected.scholarshipName || '');
        console.log('Selected scholarship details:', selected);
      } else {
        setOrganizationEmail('');
        setScholarshipName('');
      }
    } else {
      setOrganizationEmail('');
      setScholarshipName('');
    }
  };

  const handleBack = () => {
    router.back();
  };

  // Sorting function
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: string; }>({ 
    key: '', 
    direction: '' 
  });

  const sortApplicants = (key: string) => {
    const direction = sortConfig.key === key && sortConfig.direction === 'ascending' 
      ? 'descending' 
      : 'ascending';
    
    const sortedApplicants = [...applicants].sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      
      if (key === 'name') {
        return direction === 'ascending' 
          ? nameA.localeCompare(nameB) 
          : nameB.localeCompare(nameA);
      }
      if (key === 'phone') {
        return direction === 'ascending' 
          ? a.phone.localeCompare(b.phone) 
          : b.phone.localeCompare(a.phone);
      }
      if (key === 'email') {
        return direction === 'ascending' 
          ? a.email.localeCompare(b.email) 
          : b.email.localeCompare(a.email);
      }
      if (key === 'status') {
        return direction === 'ascending' 
          ? a.status.localeCompare(b.status) 
          : b.status.localeCompare(a.status);
      }
      return 0;
    });
    
    setApplicants(sortedApplicants);
    setSortConfig({ key, direction });
  };

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
      <div className="flex items-center mb-4">
        <button
          onClick={handleBack}
          className="text-[#002C84] text-3xl font-bold mr-3"
          title="Go Back"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            width="30"
            height="30"
            strokeWidth="2"
          >
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-3xl font-bold text-[#002C84]">Scholarship Listing</h1>
      </div>

      <p className="text-gray-700 mb-6">
        A platform to connect students with scholarship opportunities.
      </p>

      <div className="bg-white rounded-xl shadow-md p-6 w-full overflow-x-auto">
        <div className="flex items-center gap-3 mb-4">
          <label className="font-semibold text-[#002C84] text-sm">Select Scholarship</label>
        </div>

        <div className="flex items-center gap-3 mb-4 w-full">
          <select
            className="bg-[#e6f3ff] text-gray-700 rounded-lg px-4 py-2 w-full"
            value={selectedScholarshipId}
            onChange={(e) => handleScholarshipChange(e.target.value)}
          >
            <option value="">-- Select Scholarship Offers --</option>
            {scholarships.map((scholarship) => (
              <option key={scholarship.id} value={scholarship.id}>
                {scholarship.scholarshipName}
              </option>
            ))}
          </select>
          <button
            onClick={handleReset}
            className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center"
            title="Reset dropdown"
          >
            <span className="text-[#002C84] text-xl">&#x21bb;</span>
          </button>
        </div>

        {selectedScholarshipId && scholarshipName && (
          <div className="bg-[#f0f8ff] p-4 rounded-md mb-6">
            <h3 className="font-semibold text-[#002C84]">Scholarship Details</h3>
            <p><strong>Organization Email:</strong> {organizationEmail}</p>
            <p><strong>Scholarship Name:</strong> {scholarshipName}</p>
            <p><strong>Total Applicants:</strong> {applicants.length}</p>
          </div>
        )}

        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1167B1]"></div>
            <span className="ml-2 text-[#002C84]">Loading applicants...</span>
          </div>
        )}

        {/* Table for Applicants */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#1167B1] text-white">
              <tr>
                <th className="text-left px-4 py-2 cursor-pointer" onClick={() => sortApplicants('name')}>
                  Name
                </th>
                <th className="text-left px-4 py-2 cursor-pointer" onClick={() => sortApplicants('phone')}>
                  Phone No.
                </th>
                <th className="text-center px-4 py-2 cursor-pointer" onClick={() => sortApplicants('email')}>
                  Email
                </th>
                <th className="text-center px-4 py-2">File Upload</th>
                <th className="text-center px-4 py-2">Actions</th>
                <th className="text-center px-4 py-2 cursor-pointer" onClick={() => sortApplicants('status')}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {!loading && applicants.length > 0 ? (
                applicants.map((a, i) => (
                  <tr key={a.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#e6f3ff]'}>
                    <td className="px-4 py-3">{a.name}</td>
                    <td className="px-4 py-3">{a.phone}</td>
                    <td className="px-4 py-3 text-center text-[#1167B1] font-medium">{a.email}</td>
                    <td className="px-4 py-3 text-center">
                      {a.certificate.corFileName ? (
                        <button
                          onClick={() => setPreviewFile(a.certificate.corFileName)}
                          className="bg-[#1167B1] text-white text-xs px-3 py-1 rounded hover:bg-[#0e5a99]"
                          title="Click to preview certificate"
                        >
                          View Certificate
                        </button>
                      ) : (
                        <span className="text-gray-500 text-xs">No Certificate</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col sm:flex-row justify-center gap-2">
                        <button
                          onClick={() => handleSendEmail(a)}
                          className="bg-[#FCD116] text-black text-xs px-3 py-1 rounded hover:bg-yellow-300 transition-colors"
                          title="Send notification email to organization about this applicant"
                        >
                          📧 Notify Organization
                        </button>
                        {a.certificate.reportCardFileName ? (
                          <button
                            onClick={() => handleDownload(a.certificate.reportCardFileName)}
                            className="bg-[#1167B1] text-white text-xs px-3 py-1 rounded hover:bg-blue-800"
                            title="Download applicant credentials"
                          >
                            📄 Download
                          </button>
                        ) : (
                          <button
                            disabled
                            className="bg-gray-300 text-gray-500 text-xs px-3 py-1 rounded cursor-not-allowed"
                            title="No credentials available"
                          >
                            📄 No File
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={a.status || 'Pending'}
                        onChange={(e) => handleStatusChange(i, e.target.value)}
                        className="bg-[#1167B1] text-white rounded-lg px-4 py-1"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Already Submitted">Already Submitted</option>
                        <option value="In Review">In Review</option>
                        <option value="Approved">Approved</option>
                        <option value="Rejected">Rejected</option>
                      </select>
                    </td>
                  </tr>
                ))
              ) : !loading && selectedScholarshipId ? (
                <tr>
                  <td colSpan={6} className="text-center px-4 py-3 text-gray-500">
                    No applicants found for the selected scholarship: {scholarshipName}
                  </td>
                </tr>
              ) : !loading && !selectedScholarshipId ? (
                <tr>
                  <td colSpan={6} className="text-center px-4 py-3 text-gray-500">
                    Please select a scholarship to view applicants.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Email Modal */}
        {showEmailModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white w-[90%] max-w-2xl rounded-lg shadow-lg p-6 relative max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => {
                  setShowEmailModal(false);
                  setSelectedApplicant(null);
                }}
                className="absolute top-4 right-4 bg-gray-200 hover:bg-gray-300 text-gray-800 w-8 h-8 rounded-full flex items-center justify-center"
              >
                ×
              </button>

              <h2 className="text-2xl font-bold text-[#002C84] mb-4">📧 Send Notification to Organization</h2>

              {/* Important Notice */}
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-blue-700">
                      <strong>Email will be sent to the organization:</strong> {organizationEmail}
                      <br />
                      This notification will inform the scholarship provider about updates regarding the applicant.
                    </p>
                  </div>
                </div>
              </div>

              {selectedApplicant && (
                <div className="bg-[#f0f8ff] p-4 rounded-md mb-4">
                  <h3 className="font-semibold text-[#002C84] mb-2">👤 Applicant Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <p><strong>Name:</strong> {selectedApplicant.name}</p>
                    <p><strong>Email:</strong> {selectedApplicant.email}</p>
                    <p><strong>Phone:</strong> {selectedApplicant.phone}</p>
                    <p><strong>Status:</strong> {selectedApplicant.status}</p>
                  </div>
                  <p className="mt-2"><strong>Scholarship:</strong> {scholarshipName}</p>
                </div>
              )}

              <div className="mb-4">
                <label className="block font-semibold text-[#002C84] mb-2">📧 Recipient (Organization Email)</label>
                <input
                  type="email"
                  value={organizationEmail || ''}
                  readOnly
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 text-gray-600"
                  placeholder="Organization email address"
                />
              </div>

              <div className="mb-4">
                <label className="block font-semibold text-[#002C84] mb-2">📝 Subject *</label>
                <input
                  type="text"
                  value={emailSubject || ''}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-[#1167B1]"
                  placeholder="Enter email subject"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block font-semibold text-[#002C84] mb-2">💬 Message</label>
                <textarea
                  value={emailMessage || ''}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-[#1167B1] h-40 resize-none"
                  placeholder="Enter your message to the organization about this applicant"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowEmailModal(false);
                    setSelectedApplicant(null);
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={sendEmail}
                  disabled={isEmailSending || !emailSubject.trim() || !organizationEmail}
                  className="px-4 py-2 bg-[#1167B1] text-white rounded-lg hover:bg-[#0e5a99] transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isEmailSending ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle>
                        <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75"></path>
                      </svg>
                      Sending...
                    </>
                  ) : (
                    <>📧 Send to Organization</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* File Preview Modal */}
        {previewFile && (
          <div className="fixed inset-0 bg-blur bg-opacity-40 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white w-[90%] h-[90%] rounded-lg shadow-lg p-4 relative">
              <button
                onClick={() => setPreviewFile(null)}
                className="absolute top-4 right-4 bg-gray-200 hover:bg-gray-300 text-gray-800 w-8 h-8 rounded-full flex items-center justify-center"
              >
                ×
              </button>
              <iframe
                src={previewFile}
                className="w-full h-full rounded border"
                title="PDF Preview"
              ></iframe>
            </div>
          </div>
        )}

        <Navbar />
      </div>
    </div>
  );
}

// Main component with Suspense boundary
export default function ScholarshipListingApplicants() {
  return (
    <RequireAuth>
      <Suspense fallback={
        <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1167B1]"></div>
            <p className="text-[#002C84] font-semibold">Loading scholarship applicants...</p>
          </div>
        </div>
      }>
        <ScholarshipListingContent />
      </Suspense>
    </RequireAuth>
  );
}