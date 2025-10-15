"use client";
import { useState, useEffect } from "react";
import { db } from "@/app/Firebase/firebase";
import {
  collection,
  addDoc,
  getDocs,
  QueryDocumentSnapshot,
  DocumentData,
  doc,
  updateDoc,
} from "firebase/firestore";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { useRouter } from "next/navigation";

type Account = {
  id?: string;
  uid?: string;
  skId: string;
  name: string;
  email: string;
  barangay: string;
  position: string;
  password: string;
  birthday: string;
  civilStatus: string;
  gender: string;
  phoneNumber: string;
  modules: string[];
};

// Email configuration type
type EmailData = {
  to: string;
  subject: string;
  html: string;
}

// Email configuration - Replace with your actual Gmail credentials
const EMAIL_CONFIG = {
  GMAIL_USER: 'skcentralsystem@gmail.com', // Replace with your actual Gmail
  GMAIL_APP_PASSWORD: 'awis lkif bgih hclg', // Replace with your actual app password
};

// Send email function
const sendEmailDirectly = async (emailData: EmailData) => {
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

    console.log('Sending email to:', emailData.to);

    // Send email via API route
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

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const htmlText = await response.text();
      console.error('API returned HTML instead of JSON:', htmlText.substring(0, 200));
      throw new Error('API route not found or returning HTML. Please ensure /api/send-email/route.ts exists and is properly configured.');
    }

    const result = await response.json();

    if (!response.ok) {
      let errorMessage = result.error || 'Failed to send email';
      if (result.details) {
        errorMessage += ` (${result.details})`;
      }
      
      console.error('API Error Response:', result);
      throw new Error(errorMessage);
    }

    console.log('Email sent successfully via API');
    
    return {
      success: true,
      messageId: result.messageId || 'email_' + Date.now(),
      message: result.message || `Email notification sent successfully to ${emailData.to}`
    };

  } catch (error) {
    console.error('Email sending error:', error);
    throw error;
  }
};

// Send admin account creation email
const sendAdminCreationEmail = async (account: Account, tempPassword: string) => {
  try {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #103F91; color: white; padding: 20px; text-align: center;">
          <h1>SK Central System</h1>
          <h2>Admin Account Created</h2>
        </div>
        
        <div style="padding: 20px; background-color: #f9f9f9;">
          <h3 style="color: #103F91;">Welcome to SK Central System Admin Portal</h3>
          
          <p>Dear ${account.name},</p>
          
          <p>Your administrator account has been successfully created. You can now access the SK Central System with your credentials.</p>
          
          <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 10px 0;">
            <h4 style="color: #103F91; margin-top: 0;">Your Account Credentials</h4>
            <p><strong>SK ID:</strong> ${account.skId}</p>
            <p><strong>Email:</strong> ${account.email}</p>
            <p><strong>Temporary Password:</strong> <span style="background-color: #fff3cd; padding: 2px 5px; font-family: monospace; font-weight: bold;">${tempPassword}</span></p>
            <p><strong>Position:</strong> ${account.position}</p>
            <p><strong>Barangay:</strong> ${account.barangay}</p>
          </div>
          
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 10px 0; border-left: 4px solid #ffc107;">
            <h4 style="color: #856404; margin-top: 0;">Important Security Notice</h4>
            <p style="color: #856404; margin: 0;">Please change your password immediately after your first login for security purposes. Keep your credentials safe and do not share them with anyone.</p>
          </div>
          
          <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 10px 0;">
            <h4 style="color: #103F91; margin-top: 0;">Your Profile Information</h4>
            <p><strong>Name:</strong> ${account.name}</p>
            <p><strong>Birthday:</strong> ${account.birthday}</p>
            <p><strong>Gender:</strong> ${account.gender}</p>
            <p><strong>Civil Status:</strong> ${account.civilStatus}</p>
            <p><strong>Contact:</strong> ${account.phoneNumber}</p>
          </div>

          <div style="background-color: #e8f4ff; padding: 15px; border-radius: 5px; margin: 10px 0;">
            <h4 style="color: #103F91; margin-top: 0;">Your Assigned Modules</h4>
            <p style="margin: 0;">You have been granted access to the following modules:</p>
            <ul style="margin: 10px 0;">
              ${account.modules.map(moduleId => `<li>${moduleId}</li>`).join('')}
            </ul>
          </div>
          
          <div style="text-align: center; margin-top: 20px;">
            <p style="color: #666; font-size: 12px;">
              This is an automated notification from SK Central System.<br>
              If you have any questions, please contact the system administrator.
            </p>
          </div>
        </div>
      </div>
    `;

    await sendEmailDirectly({
      to: account.email,
      subject: `SK Admin Account Created - Welcome ${account.name}!`,
      html: htmlContent,
    });

    console.log(`Admin creation email sent to ${account.email}`);
  } catch (emailError) {
    console.error(`Failed to send admin creation email to ${account.email}:`, emailError);
    throw emailError;
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email: string, name: string, tempPassword: string) => {
  try {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #103F91; color: white; padding: 20px; text-align: center;">
          <h1>SK Central System</h1>
          <h2>Password Reset Notification</h2>
        </div>
        
        <div style="padding: 20px; background-color: #f9f9f9;">
          <h3 style="color: #103F91;">Your Password Has Been Reset</h3>
          
          <p>Dear ${name},</p>
          
          <p>Your administrator account password has been reset by a system administrator.</p>
          
          <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 10px 0;">
            <h4 style="color: #103F91; margin-top: 0;">Your New Temporary Password</h4>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Temporary Password:</strong> <span style="background-color: #fff3cd; padding: 2px 5px; font-family: monospace; font-weight: bold;">${tempPassword}</span></p>
          </div>
          
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 10px 0; border-left: 4px solid #ffc107;">
            <h4 style="color: #856404; margin-top: 0;">Important Security Notice</h4>
            <p style="color: #856404; margin: 0;">Please change your password immediately after logging in. If you did not request this password reset, please contact your system administrator immediately.</p>
          </div>
          
          <div style="text-align: center; margin-top: 20px;">
            <p style="color: #666; font-size: 12px;">
              This is an automated notification from SK Central System.<br>
              If you have any questions, please contact the system administrator.
            </p>
          </div>
        </div>
      </div>
    `;

    await sendEmailDirectly({
      to: email,
      subject: `SK Admin Password Reset - ${name}`,
      html: htmlContent,
    });

    console.log(`Password reset email sent to ${email}`);
  } catch (emailError) {
    console.error(`Failed to send password reset email to ${email}:`, emailError);
    throw emailError;
  }
};

// Import modules from navbar
const modules = [
  { id: "youth-profiling", title: "Youth Profiling", href: "/youth-profiling" },
  { id: "chat", title: "Chat", href: "/chat" },
  { id: "announcement", title: "Announcement", href: "/announcement" },
  { id: "community-event", title: "Community Event", href: "/community-event" },
  { id: "job-listing", title: "Job Listing", href: "/job-listing" },
  { id: "scholarship-listing", title: "Scholarship Listing", href: "/scholarship-listing" },
  { id: "transparency-report", title: "Transparency Report", href: "/transparency-report" },
  { id: "learning-hub", title: "Learning Hub", href: "/learningHub" },
  { id: "feedbacks", title: "Feedbacks", href: "/feedbacks" },
  { id: "podcast", title: "Podcast", href: "/LivePodcast" },
  { id: "member-approval", title: "Member Approval", href: "/member-approval" },
  { id: "user", title: "User", href: "/user" },
];

// Default modules that every user gets
const defaultModules = ["youth-profiling", "podcast", "member-approval", "user"];

const barangayMapping: { [key: string]: number } = {
  Barangka: 1,
  Calumpang: 2,
  "Concepcion Dos": 3,
  "Concepcion Uno": 4,
  Fortune: 5,
  "Industrial Valley Complex (IVC)": 6,
  "Jesus Dela Peña": 7,
  Malanday: 8,
  "Marikina Heights": 9,
  Nangka: 10,
  Parang: 11,
  "San Roque": 12,
  "Santa Elena": 13,
  "Santo Niño": 14,
  Tañong: 15,
  Tumana: 16,
};

// Generate SK ID
const generateSkId = (barangay: string) => {
  const barangayCode = barangayMapping[barangay] ?? "00";
  const twoDigits = String(Math.floor(Math.random() * 99) + 1).padStart(2, "0");
  return `SKA-2025${twoDigits}-MR-${barangayCode}`;
};

export default function AccountsTable() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [resetPasswordMessage, setResetPasswordMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    barangay: "",
    position: "",
    birthday: "",
    civilStatus: "",
    gender: "",
    phoneNumber: "",
    modules: defaultModules,
  });

  const [editFormData, setEditFormData] = useState<Account>({
    id: "",
    uid: "",
    skId: "",
    name: "",
    email: "",
    barangay: "",
    position: "",
    password: "",
    birthday: "",
    civilStatus: "",
    gender: "",
    phoneNumber: "",
    modules: [],
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
      console.warn('Gmail configuration not set properly. Please update EMAIL_CONFIG at the top of the file.');
    } else {
      console.log('Gmail configuration is properly set');
    }
  }, [isEmailConfigured]);

  // Fetch accounts from Firestore
  const fetchAccounts = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "adminUsers"));
      const fetchedAccounts: Account[] = querySnapshot.docs.map(
        (doc: QueryDocumentSnapshot<DocumentData>) => ({
          ...doc.data(),
          id: doc.id,
          modules: doc.data().modules || [],
        })
      ) as Account[];
      setAccounts(fetchedAccounts);
    } catch (error) {
      console.error("Error fetching accounts: ", error);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      const auth = getAuth();
      await signOut(auth);
      router.push("/");
    } catch (error) {
      console.error("Error logging out: ", error);
    }
  };

  // Input change for create form
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Input change for edit form
  const handleEditInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Create new account with email notification
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    
    const skId = generateSkId(formData.barangay);
    const tempPassword = "skcentralmarikina";
    
    const newAccount: Account = {
      skId,
      name: formData.name,
      email: formData.email,
      barangay: formData.barangay,
      position: formData.position,
      password: tempPassword,
      birthday: formData.birthday,
      civilStatus: formData.civilStatus,
      gender: formData.gender,
      phoneNumber: formData.phoneNumber,
      modules: formData.modules,
    };

    try {
      const auth = getAuth();
      // Create in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        newAccount.email,
        newAccount.password
      );

      // Get UID
      const uid = userCredential.user.uid;

      // Add to Firestore with UID
      await addDoc(collection(db, "adminUsers"), {
        ...newAccount,
        uid,
      });

      // Send email notification
      if (isEmailConfigured) {
        try {
          await sendAdminCreationEmail(newAccount, tempPassword);
          setConfirmMessage(
            `Account for ${newAccount.name} created successfully! An email with login credentials has been sent to ${newAccount.email}.`
          );
        } catch (emailError) {
          console.error('Email sending failed:', emailError);
          setConfirmMessage(
            `Account for ${newAccount.name} created successfully, but email notification failed. Temporary password: "${tempPassword}". Please inform the user manually.`
          );
        }
      } else {
        setConfirmMessage(
          `Account for ${newAccount.name} created successfully. Temporary password: "${tempPassword}". Note: Email notifications are disabled.`
        );
      }

      await fetchAccounts();
      setFormData({
        name: "",
        email: "",
        barangay: "",
        position: "",
        birthday: "",
        civilStatus: "",
        gender: "",
        phoneNumber: "",
        modules: defaultModules,
      });
      setShowModal(false);
      setShowSuccessModal(true);
    } catch (error: unknown) {
      console.error("Error adding account: ", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setConfirmMessage(errorMessage || "Error creating account.");
      setShowSuccessModal(true);
    } finally {
      setIsProcessing(false);
    }
  };

  // Open edit modal
  const handleEditClick = (account: Account) => {
    setEditFormData({
      ...account,
      modules: account.modules || [],
    });
    setShowEditModal(true);
    setResetPasswordMessage("");
  };

  // Submit edited account
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    
    try {
      if (!editFormData.id) return;

      const accountRef = doc(db, "adminUsers", editFormData.id);

      // Update Firestore
      await updateDoc(accountRef, {
        name: editFormData.name,
        email: editFormData.email,
        barangay: editFormData.barangay,
        position: editFormData.position,
        birthday: editFormData.birthday,
        civilStatus: editFormData.civilStatus,
        gender: editFormData.gender,
        phoneNumber: editFormData.phoneNumber,
        modules: editFormData.modules,
      });

      await fetchAccounts();
      setShowEditModal(false);
      setConfirmMessage("Account updated successfully!");
      setShowSuccessModal(true);
    } catch (error: unknown) {
      console.error("Error updating account: ", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setConfirmMessage(errorMessage || "Error updating account.");
      setShowSuccessModal(true);
    } finally {
      setIsProcessing(false);
    }
  };

  // Archive account
  const handleDeleteAccount = async () => {
    setIsProcessing(true);
    
    try {
      if (!editFormData.id || !editFormData.uid) {
        setConfirmMessage("Account ID or UID missing for archiving.");
        setShowSuccessModal(true);
        return;
      }

      await updateDoc(doc(db, "adminUsers", editFormData.id), {
        archived: true,
      });

      const auth = getAuth();
      const currentUser = auth.currentUser;

      if (currentUser && currentUser.uid === editFormData.uid) {
        await signOut(auth);
      }

      await fetchAccounts();
      setShowEditModal(false);
      setConfirmMessage("Account archived successfully!");
      setShowSuccessModal(true);
    } catch (error: unknown) {
      console.error("Error archiving account: ", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setConfirmMessage(errorMessage || "Error archiving account.");
      setShowSuccessModal(true);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Reset Password with email notification
  const handleResetPassword = async () => {
    setIsProcessing(true);
    
    try {
      if (!editFormData.email || !editFormData.id) {
        setResetPasswordMessage("Account email or ID is missing for password reset.");
        return;
      }

      const tempPassword = "skcentralmarikina";

      // Reset the password in Firestore
      await updateDoc(doc(db, "adminUsers", editFormData.id), {
        password: tempPassword,
      });

      // Send email notification
      if (isEmailConfigured) {
        try {
          await sendPasswordResetEmail(editFormData.email, editFormData.name, tempPassword);
          setResetPasswordMessage(
            `Password reset email sent to ${editFormData.email}. The temporary password is: "${tempPassword}"`
          );
        } catch (emailError) {
          console.error('Password reset email failed:', emailError);
          setResetPasswordMessage(
            `Password reset to "${tempPassword}" but email notification failed. Please inform the user manually.`
          );
        }
      } else {
        setResetPasswordMessage(
          `Password reset to "${tempPassword}". Note: Email notifications are disabled.`
        );
      }
    } catch (error: unknown) {
      console.error("Error resetting password: ", error);
      setResetPasswordMessage(
        error instanceof Error ? error.message : "Failed to reset password."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    setResetPasswordMessage("");
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  return (
    <>
      <div className="min-h-screen flex bg-[#E9F1F9]">
        {/* Sidebar */}
        <div className="w-8 flex flex-col">
          <div className="flex-1 bg-[#0A2F7A]" />
          <div className="flex-1 bg-[#E53935]" />
          <div className="flex-1 bg-[#FDD835]" />
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          <div className="flex justify-between items-center p-8">
            <div>
              <h1 className="text-4xl font-bold text-[#103F91]">
                Configurations of Accounts
              </h1>
              {!isEmailConfigured && (
                <p className="text-sm text-orange-600 mt-2">
                  ⚠️ Email notifications are disabled. Please configure EMAIL_CONFIG.
                </p>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="bg-red-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors"
            >
              Logout
            </button>
          </div>

          {/* Table */}
          <div className="bg-white shadow-md rounded-2xl mx-8 p-6">
            <div className="flex justify-between items-center mb-4">
              <p className="font-semibold">Accounts are shown below.</p>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-4 py-2 font-semibold text-[#103F91] hover:bg-gray-100"
              >
                Create New Account <span className="text-2xl">+</span>
              </button>
            </div>

            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#103F91] text-white">
                  <th className="py-3 px-4 text-left">SK ID</th>
                  <th className="py-3 px-4 text-left">Name</th>
                  <th className="py-3 px-4 text-left">Email</th>
                  <th className="py-3 px-4 text-left">Barangay</th>
                  <th className="py-3 px-4 text-left">Position</th>
                  <th className="py-3 px-4 text-left">Modules</th>
                  <th className="py-3 px-4 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account, idx) => (
                  <tr
                    key={account.id ?? idx}
                    className={idx % 2 === 1 ? "bg-[#E8F4FF]" : ""}
                  >
                    <td className="py-3 px-4">{account.skId}</td>
                    <td className="py-3 px-4">{account.name}</td>
                    <td className="py-3 px-4 underline text-[#103F91] cursor-pointer">
                      {account.email}
                    </td>
                    <td className="py-3 px-4">{account.barangay}</td>
                    <td className="py-3 px-4">{account.position}</td>
                    <td className="py-3 px-4">
                      <div className="text-sm">
                        {account.modules?.map(moduleId => {
                          const foundModule = modules.find(m => m.id === moduleId);
                          return foundModule ? foundModule.title : moduleId;
                        }).join(", ") || "No modules assigned"}
                      </div>
                    </td>
                    <td className="py-3 px-4 flex gap-2">
                      <button
                        onClick={() => handleEditClick(account)}
                        className="bg-[#1976D2] text-white px-3 py-1 rounded-md hover:bg-[#125a9c]"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#e7f0fa] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-lg border-2 border-[#0A2F7A] relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-red-600 text-white font-bold hover:bg-red-700 shadow-md"
              disabled={isProcessing}
            >
              ✕
            </button>
            <h2 className="text-2xl font-bold text-[#0A2F7A] mb-4">
              Create New Account
            </h2>
            {!isEmailConfigured && (
              <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded">
                <p className="text-sm text-orange-800">
                  ⚠️ Email notifications are disabled. Users will not receive automatic credential emails.
                </p>
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  name="name"
                  placeholder="Full Name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  className="w-full p-3 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-[#0A2F7A]"
                />
                <input
                  type="email"
                  name="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="w-full p-3 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-[#0A2F7A]"
                />
                <select
                  name="barangay"
                  value={formData.barangay}
                  onChange={handleInputChange}
                  required
                  className="w-full p-3 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-[#0A2F7A]"
                >
                  <option value="" disabled>Select Barangay</option>
                  {Object.keys(barangayMapping).map((brgy) => (
                    <option key={brgy} value={brgy}>{brgy}</option>
                  ))}
                </select>
                <select
                  name="position"
                  value={formData.position}
                  onChange={handleInputChange}
                  required
                  className="w-full p-3 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-[#0A2F7A]"
                >
                  <option value="" disabled>Select Position</option>
                  <option value="President">President</option>
                  <option value="Vice President">Vice President</option>
                  <option value="Secretary">Secretary</option>
                  <option value="Treasurer">Treasurer</option>
                  <option value="Auditor">Auditor</option>
                  <option value="Sgt. At Arm.">Sgt. At Arm.</option>
                  <option value="SK Chairperson">SK Chairperson</option>
                </select>
                <input
                  type="date"
                  name="birthday"
                  value={formData.birthday}
                  onChange={handleInputChange}
                  required
                  className="w-full p-3 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-[#0A2F7A]"
                />
                <select
                  name="civilStatus"
                  value={formData.civilStatus}
                  onChange={handleInputChange}
                  required
                  className="w-full p-3 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-[#0A2F7A]"
                >
                  <option value="" disabled>Select Civil Status</option>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Widowed">Widowed</option>
                  <option value="Separated">Separated</option>
                </select>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleInputChange}
                  required
                  className="w-full p-3 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-[#0A2F7A]"
                >
                  <option value="" disabled>Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                <input
                  type="text"
                  name="phoneNumber"
                  placeholder="Phone Number"
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                  required
                  className="w-full p-3 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-[#0A2F7A]"
                />
              </div>

              {/* Module Permissions */}
              <div className="mt-4">
                <h3 className="text-[#0A2F7A] font-semibold mb-2">
                  Assign Modules 
                  <span className="text-sm font-normal text-gray-600 ml-2">
                    (Default modules are pre-selected)
                  </span>
                </h3>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                  {modules.map((mod) => (
                    <label key={mod.id} className="flex items-center gap-2 bg-white text-[#0A2F7A] p-2 rounded-md hover:bg-[#e0f2ff] cursor-pointer">
                      <input
                        type="checkbox"
                        value={mod.id}
                        checked={formData.modules.includes(mod.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const id = e.target.value;
                          setFormData((prev) => ({
                            ...prev,
                            modules: checked
                              ? [...prev.modules, id]
                              : prev.modules.filter((mid) => mid !== id),
                          }));
                        }}
                        className="accent-[#0A2F7A]"
                      />
                      <span className="text-sm">{mod.title}</span>
                      {defaultModules.includes(mod.id) && (
                        <span className="text-xs bg-blue-100 text-blue-600 px-1 rounded">
                          Default
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="bg-gray-400 text-white px-4 py-2 rounded-lg hover:bg-gray-500"
                  disabled={isProcessing}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#103F91] text-white px-4 py-2 rounded-lg hover:bg-[#0A2F7A] disabled:bg-gray-400"
                  disabled={isProcessing}
                >
                  {isProcessing ? "Creating..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#e7f0fa] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-lg border-2 border-[#0A2F7A] relative">
            <button
              onClick={() => setShowEditModal(false)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-red-600 text-white font-bold hover:bg-red-700 shadow-md"
              disabled={isProcessing}
            >
              ✕
            </button>
            <h2 className="text-2xl font-bold text-[#0A2F7A] mb-4">
              Edit Account Information
            </h2>
            <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  name="name"
                  placeholder="Full Name"
                  value={editFormData.name}
                  onChange={handleEditInputChange}
                  required
                  className="w-full p-3 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-[#0A2F7A]"
                />
                <input
                  type="email"
                  name="email"
                  placeholder="Email"
                  value={editFormData.email}
                  onChange={handleEditInputChange}
                  required
                  className="w-full p-3 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-[#0A2F7A]"
                />
                <select
                  name="barangay"
                  value={editFormData.barangay}
                  onChange={handleEditInputChange}
                  required
                  className="w-full p-3 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-[#0A2F7A]"
                >
                  <option value="" disabled>Select Barangay</option>
                  {Object.keys(barangayMapping).map((brgy) => (
                    <option key={brgy} value={brgy}>{brgy}</option>
                  ))}
                </select>
                <select
                  name="position"
                  value={editFormData.position}
                  onChange={handleEditInputChange}
                  required
                  className="w-full p-3 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-[#0A2F7A]"
                >
                  <option value="" disabled>Select Position</option>
                  <option value="President">President</option>
                  <option value="Vice President">Vice President</option>
                  <option value="Secretary">Secretary</option>
                  <option value="Treasurer">Treasurer</option>
                  <option value="Auditor">Auditor</option>
                  <option value="Sgt. At Arm.">Sgt. At Arm.</option>
                  <option value="SK Chairperson">SK Chairperson</option>
                </select>
                <input
                  type="date"
                  name="birthday"
                  value={editFormData.birthday}
                  onChange={handleEditInputChange}
                  required
                  className="w-full p-3 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-[#0A2F7A]"
                />
                <select
                  name="civilStatus"
                  value={editFormData.civilStatus}
                  onChange={handleEditInputChange}
                  required
                  className="w-full p-3 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-[#0A2F7A]"
                >
                  <option value="" disabled>Select Civil Status</option>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Widowed">Widowed</option>
                  <option value="Separated">Separated</option>
                </select>
                <select
                  name="gender"
                  value={editFormData.gender}
                  onChange={handleEditInputChange}
                  required
                  className="w-full p-3 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-[#0A2F7A]"
                >
                  <option value="" disabled>Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                <input
                  type="text"
                  name="phoneNumber"
                  placeholder="Phone Number"
                  value={editFormData.phoneNumber}
                  onChange={handleEditInputChange}
                  required
                  className="w-full p-3 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-[#0A2F7A]"
                />
              </div>

              {/* Module Permissions */}
              <div className="mt-4">
                <h3 className="text-[#0A2F7A] font-semibold mb-2">
                  Edit Module Permissions
                </h3>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                  {modules.map((mod) => (
                    <label key={mod.id} className="flex items-center gap-2 bg-white text-[#0A2F7A] p-2 rounded-md hover:bg-[#e0f2ff] cursor-pointer">
                      <input
                        type="checkbox"
                        value={mod.id}
                        checked={editFormData.modules?.includes(mod.id) || false}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const id = e.target.value;
                          setEditFormData((prev) => ({
                            ...prev,
                            modules: checked
                              ? [...(prev.modules || []), id]
                              : (prev.modules || []).filter((mid) => mid !== id),
                          }));
                        }}
                        className="accent-[#0A2F7A]"
                      />
                      <span className="text-sm">{mod.title}</span>
                      {defaultModules.includes(mod.id) && (
                        <span className="text-xs bg-blue-100 text-blue-600 px-1 rounded">
                          Default
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-4">
                {resetPasswordMessage && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                    <p className="text-sm text-blue-800 font-medium">
                      {resetPasswordMessage}
                    </p>
                  </div>
                )}
                <div className="flex justify-between gap-2 mt-2">
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    className="bg-yellow-500 text-black px-4 py-2 rounded-lg hover:bg-orange-600 flex-1 disabled:bg-gray-400"
                    disabled={isProcessing}
                  >
                    {isProcessing ? "Resetting..." : "Reset Password"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 flex-1 disabled:bg-gray-400"
                    disabled={isProcessing}
                  >
                    {isProcessing ? "Archiving..." : "Archive Account"}
                  </button>
                </div>
                <button
                  type="submit"
                  className="bg-[#103F91] text-white px-4 py-2 rounded-lg hover:bg-[#0A2F7A] disabled:bg-gray-400"
                  disabled={isProcessing}
                >
                  {isProcessing ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-opacity-50 backdrop-blur-lg flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-[#0A2F7A] w-full max-w-md text-center">
            <div className="mb-4">
              <svg className="w-16 h-16 mx-auto text-green-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <p className="text-[#103F91] font-semibold mb-4 whitespace-pre-line">
              {confirmMessage}
            </p>
            <button
              onClick={handleCloseSuccessModal}
              className="bg-[#103F91] text-white px-6 py-2 rounded-lg hover:bg-[#0A2F7A]"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}