/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, Suspense } from 'react';
import { db } from "@/app/Firebase/firebase";
import { collection, getDocs, query, where, updateDoc } from 'firebase/firestore';
import Navbar from "../../Components/Navbar";
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import RequireAuth from "@/app/Components/RequireAuth";

// 📧 EMAIL CONFIGURATION - UPDATE THESE WITH YOUR GMAIL CREDENTIALS
const EMAIL_CONFIG = {
  GMAIL_USER: 'skcentralsystem@gmail.com', // Replace with your actual Gmail
  GMAIL_APP_PASSWORD: 'awis lkif bgih hclg', // Replace with your actual app password
};

// 📧 EMAIL SENDING FUNCTION
const sendEmailDirectly = async (emailData: any) => {
  try {
    // Validate email configuration
    if (!EMAIL_CONFIG.GMAIL_USER ||
        !EMAIL_CONFIG.GMAIL_APP_PASSWORD ||
        EMAIL_CONFIG.GMAIL_USER.trim() === '' ||
        EMAIL_CONFIG.GMAIL_APP_PASSWORD.trim() === '' ||
        !EMAIL_CONFIG.GMAIL_USER.includes('@') ||
        EMAIL_CONFIG.GMAIL_APP_PASSWORD.length < 16) {
      throw new Error('Gmail credentials not configured properly in EMAIL_CONFIG. Please check your email and app password.');
    }

    console.log('📧 Sending email notification to organization:');
    console.log('From:', EMAIL_CONFIG.GMAIL_USER);
    console.log('To:', emailData.to);
    console.log('CC:', emailData.cc || 'None');
    console.log('Subject:', emailData.subject);

    // Send email via API route
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_CONFIG.GMAIL_USER,
        to: emailData.to,
        cc: emailData.cc || [],
        subject: emailData.subject,
        html: emailData.html,
        gmailUser: EMAIL_CONFIG.GMAIL_USER,
        gmailPassword: EMAIL_CONFIG.GMAIL_APP_PASSWORD,
        attachments: emailData.attachments || [],
      }),
    });

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const htmlText = await response.text();
      console.error('❌ API returned HTML instead of JSON:', htmlText.substring(0, 200));
      throw new Error('API route not found or returning HTML. Please ensure /api/send-email/route.ts exists and is properly configured.');
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
    throw error; // Re-throw to show proper error to user
  }
};

interface Applicant {
  id: string;
  name: string;
  phone: string;
  email: string;
  certificateUrl: string;
  certificateFileName: string;
  status: string;
}

interface Scholarship {
  id: string;
  scholarshipName: string;
  providerEmail: string;
  [key: string]: any;
}

// Helper function to extract clean file name from URL
const getFileNameFromUrl = (url: string): string => {
  if (!url) return '';
  try {
    // Get the last segment after the last slash and before query parameters
    const urlPath = url.split('?')[0];
    const fileName = decodeURIComponent(urlPath.split('/').pop() || '');
    
    // Remove any Firebase storage prefixes if they exist
    const cleanFileName = fileName.replace(/^.*%2F/, '');
    
    return cleanFileName || 'file.pdf';
  } catch (error) {
    console.error('Error extracting filename:', error);
    return 'file.pdf';
  }
};

// Inner component that uses useSearchParams
function ScholarshipListingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedScholarshipId, setSelectedScholarshipId] = useState<string>('');
  const [previewFile, setPreviewFile] = useState<string | null>(null);

  // Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);
  
  // Bulk actions state
  const [isBulkNotifying, setIsBulkNotifying] = useState(false);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);

  // Auto status update mode
  const [autoStatusUpdate, setAutoStatusUpdate] = useState(true);

  const [organizationEmail, setOrganizationEmail] = useState<string>('');
  const [scholarshipName, setScholarshipName] = useState<string>('');
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [loading, setLoading] = useState(false);

  // Sorting state
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: string; }>({ 
    key: '', 
    direction: '' 
  });

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
        setOrganizationEmail(selected.providerEmail || '');
        setScholarshipName(selected.scholarshipName || '');
        console.log('Selected scholarship:', selected);
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
        
        // Match by scholarshipName or scholarshipId
        let applicantsQuery = query(
          scholarshipApplicantsRef,
          where("scholarshipName", "==", scholarshipName)
        );
        let applicantsSnapshot = await getDocs(applicantsQuery);

        if (applicantsSnapshot.empty) {
          applicantsQuery = query(
            scholarshipApplicantsRef,
            where("scholarshipId", "==", selectedScholarshipId)
          );
          applicantsSnapshot = await getDocs(applicantsQuery);
        }

        if (applicantsSnapshot.empty) {
          console.log("No applicants found");
          setApplicants([]);
          setLoading(false);
          return;
        }

        // Fetch all ApprovedUsers
        const approvedUsersRef = collection(db, "ApprovedUsers");
        const approvedUsersSnapshot = await getDocs(approvedUsersRef);

        // Map approved users by uid
        const approvedUsersMap = new Map<string, any>();
        approvedUsersSnapshot.docs.forEach((doc) => {
          const userData = doc.data();
          if (userData.uid) {
            approvedUsersMap.set(userData.uid, userData);
          }
        });

        // Build applicants list
        const applicantsList: Applicant[] = applicantsSnapshot.docs.map((doc) => {
          const applicantData = doc.data();
          const applicantUid = applicantData.uid || "";
          const userData = approvedUsersMap.get(applicantUid);

          // Get certificate URL and extract clean file name
          const certificateUrl = applicantData.corFileName || applicantData.certificateUrl || applicantData.reportCardFileName || "";
          const certificateFileName = getFileNameFromUrl(certificateUrl);

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
              certificateUrl: certificateUrl,
              certificateFileName: certificateFileName,
              status: applicantData.status || "Pending",
            };
          } else {
            return {
              id: doc.id,
              name: applicantData.name || applicantData.fullName || "User not found",
              phone: applicantData.phone || applicantData.contact || "N/A",
              email: applicantData.email || applicantData.userEmail || "N/A",
              certificateUrl: certificateUrl,
              certificateFileName: certificateFileName,
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
  }, [selectedScholarshipId, scholarshipName]);

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
    
    // Email subject
    setEmailSubject(`SCHOLARSHIP APPLICATION FOR ${scholarshipName.toUpperCase()}`);
    
    // Email message
    setEmailMessage(
      `Dear Scholarship Committee,

Please find attached the scholarship application from ${applicant.name} for the ${scholarshipName} scholarship.

Applicant Details:
- Name: ${applicant.name}
- Email: ${applicant.email}
- Phone: ${applicant.phone}
- Current Status: ${applicant.status}

The applicant's Enrollment Certificate is attached to this email for your review.

Please reply to ${applicant.email} for any updates or further communication with the applicant.

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
            <h2>Scholarship Application</h2>
          </div>
          
          <div style="padding: 20px; background-color: #f9f9f9;">
            <h3 style="color: #002C84;">New Scholarship Application</h3>
            
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

            <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 10px 0; border-left: 4px solid #ffc107;">
              <p style="margin: 0; color: #856404;">
                <strong>📧 For Updates:</strong> Please reply directly to <a href="mailto:${selectedApplicant.email}" style="color: #1167B1;">${selectedApplicant.email}</a> for any communication with the applicant.
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
              <p style="color: #666; font-size: 12px;">
                This is an automated notification from SK Central System.<br>
                The applicant's Enrollment Certificate is attached to this email.
              </p>
            </div>
          </div>
        </div>
      `;

      // Prepare CC list - always include applicant
      const ccEmails = selectedApplicant.email !== 'N/A' ? [selectedApplicant.email] : [];

      // Prepare attachments
      const attachments = [];
      if (selectedApplicant.certificateUrl && selectedApplicant.certificateUrl.trim() !== '') {
        attachments.push({
          filename: selectedApplicant.certificateFileName || 'enrollment_certificate.pdf',
          path: selectedApplicant.certificateUrl
        });
      }

      const result = await sendEmailDirectly({
        to: organizationEmail,
        cc: ccEmails,
        subject: emailSubject,
        html: htmlContent,
        attachments: attachments
      });

      if (result.success) {
        alert(`✅ Email sent successfully to organization (${organizationEmail}) with CC to applicant (${selectedApplicant.email})!`);
        
        // Update status to "Already Submitted" if auto mode is enabled
        if (autoStatusUpdate) {
          await updateApplicantStatus(selectedApplicant.email, 'Already Submitted');
        }
        
        setShowEmailModal(false);
        setSelectedApplicant(null);
        setEmailSubject('');
        setEmailMessage('');
      } else {
        alert(`❌ Failed to send email: ${result.message}`);
      }
    } catch (error: any) {
      console.error('Error sending email:', error);
      
      // Provide specific error messages
      let errorMessage = error.message;
      if (error.message.includes('API route not found')) {
        errorMessage = 'API route not found. Please create the file: app/api/send-email/route.ts';
      } else if (error.message.includes('Gmail credentials not configured')) {
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
      await updateApplicantStatus(applicant.email, newStatus);
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status. Please try again.');
    }
  };

  // Helper function to update applicant status
  const updateApplicantStatus = async (applicantEmail: string, newStatus: string) => {
    try {
      console.log('Updating status for applicant:', applicantEmail, 'to:', newStatus);

      // Update the status in Firebase
      const applicantRef = collection(db, 'scholarshipApplicants');
      const applicantQuery = query(applicantRef, where('email', '==', applicantEmail));
      const applicantSnapshot = await getDocs(applicantQuery);

      if (applicantSnapshot.docs.length > 0) {
        const docRef = applicantSnapshot.docs[0].ref;
        await updateDoc(docRef, { status: newStatus });
        console.log('Status updated successfully in Firebase');
      }

      // Update local state
      const updatedApplicants = applicants.map(a => 
        a.email === applicantEmail ? { ...a, status: newStatus } : a
      );
      setApplicants(updatedApplicants);

    } catch (error) {
      console.error('Error updating status in Firebase:', error);
      throw error;
    }
  };

  // Bulk notify all applicants
  const handleBulkNotify = async () => {
    if (!organizationEmail) {
      alert('⚠️ Organization email not found. Please ensure the scholarship has a valid organization email.');
      return;
    }

    if (!isEmailConfigured) {
      alert('⚠️ Email service not configured. Please set up Gmail credentials in EMAIL_CONFIG at the top of the file.');
      return;
    }

    const applicantsToNotify = applicants.filter(a => a.email !== 'N/A');
    
    if (applicantsToNotify.length === 0) {
      alert('No applicants to notify.');
      return;
    }

    const confirm = window.confirm(`Are you sure you want to send notifications to the organization about all ${applicantsToNotify.length} applicants?`);
    if (!confirm) return;

    setIsBulkNotifying(true);

    try {
      // Build applicant list for email
      const applicantListHtml = applicantsToNotify.map((applicant, index) => `
        <tr style="background-color: ${index % 2 === 0 ? '#f9f9f9' : '#ffffff'};">
          <td style="padding: 10px; border: 1px solid #ddd;">${index + 1}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${applicant.name}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${applicant.email}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${applicant.phone}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${applicant.status}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${applicant.certificateFileName || 'N/A'}</td>
        </tr>
      `).join('');

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
          <div style="background-color: #002C84; color: white; padding: 20px; text-align: center;">
            <h1>SK Central System</h1>
            <h2>Bulk Scholarship Applications</h2>
          </div>
          
          <div style="padding: 20px; background-color: #f9f9f9;">
            <h3 style="color: #002C84;">Multiple Applications for ${scholarshipName}</h3>
            
            <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 10px 0;">
              <p>Dear Scholarship Committee,</p>
              <p>Please find below the list of all applicants for the <strong>${scholarshipName}</strong> scholarship. All Enrollment Certificates are attached to this email for your review.</p>
              
              <h4 style="color: #1167B1; margin-top: 20px;">Applicants Summary (${applicantsToNotify.length} Total)</h4>
              <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                  <thead>
                    <tr style="background-color: #1167B1; color: white;">
                      <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">#</th>
                      <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Name</th>
                      <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Email</th>
                      <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Phone</th>
                      <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Status</th>
                      <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Certificate</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${applicantListHtml}
                  </tbody>
                </table>
              </div>
            </div>

            <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 10px 0; border-left: 4px solid #ffc107;">
              <p style="margin: 0; color: #856404;">
                <strong>📧 For Updates:</strong> Please reply directly to each applicant's email address for any communication. All applicants have been CC'd on this email.
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
              <p style="color: #666; font-size: 12px;">
                This is an automated notification from SK Central System.<br>
                All applicant Enrollment Certificates are attached to this email.
              </p>
            </div>
          </div>
        </div>
      `;

      // Prepare CC list - all applicants
      const ccEmails = applicantsToNotify
        .filter(a => a.email !== 'N/A')
        .map(a => a.email);

      // Prepare attachments - all certificates
      const attachments = applicantsToNotify
        .filter(a => a.certificateUrl && a.certificateUrl.trim() !== '')
        .map(a => ({
          filename: a.certificateFileName || `${a.name}_certificate.pdf`,
          path: a.certificateUrl
        }));

      await sendEmailDirectly({
        to: organizationEmail,
        cc: ccEmails,
        subject: `SCHOLARSHIP APPLICATION FOR ${scholarshipName.toUpperCase()} - ${applicantsToNotify.length} Applicants`,
        html: htmlContent,
        attachments: attachments
      });

      // Update status for all applicants if auto mode is enabled
      if (autoStatusUpdate) {
        for (const applicant of applicantsToNotify) {
          await updateApplicantStatus(applicant.email, 'Already Submitted');
        }
      }

      setIsBulkNotifying(false);
      alert(`✅ Bulk notification sent successfully!\n\n${applicantsToNotify.length} applicants notified with ${attachments.length} certificates attached.`);
    } catch (error) {
      console.error('Bulk notification error:', error);
      setIsBulkNotifying(false);
      alert('❌ Failed to send bulk notification. Please try again.');
    }
  };

  // Bulk download all certificates
  const handleBulkDownload = async () => {
    const applicantsWithCertificate = applicants.filter(a => a.certificateUrl && a.certificateUrl.trim() !== '');
    
    if (applicantsWithCertificate.length === 0) {
      alert('No certificates available to download.');
      return;
    }

    const confirmDownload = window.confirm(`Are you sure you want to download all ${applicantsWithCertificate.length} certificates? This will download them individually.`);
    if (!confirmDownload) return;

    setIsBulkDownloading(true);

    let successCount = 0;
    let failCount = 0;

    for (const applicant of applicantsWithCertificate) {
      try {
        // Create a delay between downloads to avoid browser blocking
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Fetch the certificate file as a blob
        const response = await fetch(applicant.certificateUrl);
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = applicant.certificateFileName || 'certificate.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        // Update status if auto mode is enabled
        if (autoStatusUpdate) {
          await updateApplicantStatus(applicant.email, 'Already Submitted');
        }

        successCount++;
      } catch (error) {
        console.error(`Failed to download certificate for ${applicant.name}:`, error);
        failCount++;
      }
    }

    setIsBulkDownloading(false);
    alert(`✅ Bulk download complete!\n\nSuccess: ${successCount}\nFailed: ${failCount}`);
  };

  // Reset function
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
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-[#002C84]">Scholarship Details</h3>
                <p><strong>Organization Email:</strong> {organizationEmail}</p>
                <p><strong>Scholarship Name:</strong> {scholarshipName}</p>
                <p><strong>Total Applicants:</strong> {applicants.length}</p>
              </div>
              
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-gray-300">
                  <input
                    type="checkbox"
                    id="autoStatus"
                    checked={autoStatusUpdate}
                    onChange={(e) => setAutoStatusUpdate(e.target.checked)}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="autoStatus" className="text-sm font-medium text-[#002C84] cursor-pointer">
                    Auto-update status to "Already Submitted"
                  </label>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={handleBulkNotify}
                    disabled={isBulkNotifying || applicants.length === 0}
                    className="bg-[#FCD116] text-black text-xs px-4 py-2 rounded hover:bg-yellow-300 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                    title="Send notification emails to organization for all applicants"
                  >
                    {isBulkNotifying ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle>
                          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75"></path>
                        </svg>
                        Sending...
                      </>
                    ) : (
                      <>📧 Notify All</>
                    )}
                  </button>

                  <button
                    onClick={handleBulkDownload}
                    disabled={isBulkDownloading || applicants.filter(a => a.certificateUrl).length === 0}
                    className="bg-[#1167B1] text-white text-xs px-4 py-2 rounded hover:bg-blue-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                    title="Download all certificates"
                  >
                    {isBulkDownloading ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle>
                          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75"></path>
                        </svg>
                        Downloading...
                      </>
                    ) : (
                      <>📥 Download All Certificates</>
                    )}
                  </button>
                </div>
              </div>
            </div>
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
                  Name {sortConfig.key === 'name' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                </th>
                <th className="text-left px-4 py-2 cursor-pointer" onClick={() => sortApplicants('phone')}>
                  Phone No. {sortConfig.key === 'phone' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                </th>
                <th className="text-center px-4 py-2 cursor-pointer" onClick={() => sortApplicants('email')}>
                  Email {sortConfig.key === 'email' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                </th>
                <th className="text-center px-4 py-2">Enrollment Certificate</th>
                <th className="text-center px-4 py-2">Actions</th>
                <th className="text-center px-4 py-2 cursor-pointer" onClick={() => sortApplicants('status')}>
                  Status {sortConfig.key === 'status' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
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
                      {a.certificateUrl ? (
                        <a href={a.certificateUrl} download style={{ textDecoration: 'none' }}>
                          <button style={{ backgroundColor: '#007bff', border: 'none', color: 'white', padding: '8px 16px', fontSize: '14px', borderRadius: '4px', cursor: 'pointer' }}>
                            certificate file
                          </button>
                        </a>
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
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={a.status}
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
            <div className="fixed inset-0 bg-opacity-50 backdrop-blur-md flex items-center justify-center z-50">
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

              <h2 className="text-2xl font-bold text-[#002C84] mb-4">📧 Send Application to Organization</h2>

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
                      <strong>Email will be sent to:</strong> {organizationEmail}
                      <br />
                      <strong>CC:</strong> {selectedApplicant?.email}
                      <br />
                      The applicant's Enrollment Certificate will be attached to the email.
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
                  <p className="mt-2"><strong>Certificate:</strong> {selectedApplicant.certificateFileName || 'No certificate'}</p>
                </div>
              )}

              <div className="mb-4">
                <label className="block font-semibold text-[#002C84] mb-2">📧 Recipient (Organization Email)</label>
                <input
                  type="email"
                  value={organizationEmail}
                  readOnly
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 text-gray-600"
                  placeholder="Organization email address"
                />
              </div>

              <div className="mb-4">
                <label className="block font-semibold text-[#002C84] mb-2">📝 Subject *</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-[#1167B1]"
                  placeholder="Enter email subject"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block font-semibold text-[#002C84] mb-2">💬 Message</label>
                <textarea
                  value={emailMessage}
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
      </div>
      
      <Navbar />
    </div>
  );
}

// Loading fallback component
function LoadingFallback() {
  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1167B1]"></div>
        <span className="ml-3 text-[#002C84] text-lg">Loading...</span>
      </div>
    </div>
  );
}

// Main export component wrapped with Suspense
export default function ScholarshipListing() {
  return (
    <RequireAuth>
      <Suspense fallback={<LoadingFallback />}>
        <ScholarshipListingContent />
      </Suspense>
    </RequireAuth>
  );
}