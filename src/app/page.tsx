/* eslint-disable @typescript-eslint/no-unused-vars */
"use client"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import { db, auth } from "@/app/Firebase/firebase"
import { collection, getDocs, setDoc, deleteDoc, doc, Timestamp, getDoc, addDoc, query, where } from "firebase/firestore"
import { User } from "firebase/auth"

import Navbar from "@/app/Components/Navbar"
import RequireAuth from "@/app/Components/RequireAuth"
import { recordActivityLog } from "@/app/Components/recordActivityLog"

// Define a type for the email data parameter used in the sendEmailDirectly function
type EmailData = {
  to: string;
  subject: string;
  html: string;
}

const EMAIL_CONFIG = {
  GMAIL_USER: 'skcentralsystem@gmail.com', // Replace with your actual Gmail
  GMAIL_APP_PASSWORD: 'awis lkif bgih hclg', // Replace with your actual app password
};

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
    throw error; // Re-throw to show proper error to user
  }
};

// --- Enhanced Member Type Definition ---
type Member = {
  id: string
  skId: string
  firstName: string
  middleName: string
  lastName: string
  suffix: string
  age: string
  birthday: string
  gender: string
  contact: string
  email: string
  barangay: string
  city: string
  province: string
  frontIDUrl: string
  backIDUrl: string
  isApproved: boolean
  submittedAt: Timestamp | null
}

type SortConfig = {
  key: keyof Member
  direction: "asc" | "desc"
}

type ActionType = "approve" | "disapprove" | "none"

// Enhanced action data type to include disapproval messages
type ActionData = {
  action: ActionType
  disapprovalMessage?: string
}

// --- Loading Component ---
const LoadingSpinner = () => (
  <div className="flex justify-center items-center py-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1167B1]"></div>
  </div>
)

// --- Enhanced Main Component ---
export default function MemberApproval() {
  const [members, setMembers] = useState<Member[]>([])
  const [actions, setActions] = useState<Record<string, ActionData>>({})
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showConfirmAllModal, setShowConfirmAllModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [showDisapprovalModal, setShowDisapprovalModal] = useState(false)
  const [currentDisapprovalMember, setCurrentDisapprovalMember] = useState<string>("")
  const [disapprovalMessage, setDisapprovalMessage] = useState("")
  const [currentUser, setCurrentUser] = useState<User | null>(null) // Track current user
  const [userDocId, setUserDocId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoadingPosition, setIsLoadingPosition] = useState(true)

  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "firstName",
    direction: "asc",
  })

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

  // Generate random password
  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  // --- Enhanced Fetch Members Function ---
  const fetchMembers = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const querySnapshot = await getDocs(collection(db, "conUsers"))
      const memberList: Member[] = querySnapshot.docs.map((docSnap) => {
        const data = docSnap.data()
        return {
          id: docSnap.id,
          skId: data.skId || "",
          firstName: data.firstName || "",
          middleName: data.middleName || "",
          lastName: data.lastName || "",
          suffix: data.suffix || "",
          age: data.age || "",
          birthday: data.birthday || "",
          gender: data.gender || "",
          contact: data.contact || "",
          email: data.email || "",
          barangay: data.barangay || "",
          city: data.city || "",
          province: data.province || "",
          frontIDUrl: data.frontIDUrl || "",
          backIDUrl: data.backIDUrl || "",
          isApproved: data.isApproved || false,
          submittedAt: data.submittedAt || null,
        }
      })

      setMembers(memberList)
      setActions({})

      // Create success notification
      if (userDocId) {
        await addDoc(collection(db, "notifications"), {
          userId: userDocId,
          message: `Successfully loaded ${memberList.length} pending member applications`,
          type: "data_fetch",
          createdAt: Timestamp.now(),
          read: false
        });
      }

      // Log successful fetch
      if (currentUser) {
        await recordActivityLog({
          action: 'Fetch Pending Applications',
          details: `Successfully loaded ${memberList.length} pending member applications`,
          userId: currentUser.uid,
          userEmail: currentUser.email || undefined,
          category: 'user'
        });
      }

    } catch (error) {
      console.error("Error fetching members: ", error)
      setError("Failed to fetch SK constituents. Please try again.")
      
      // Create error notification
      if (userDocId) {
        await addDoc(collection(db, "notifications"), {
          userId: userDocId,
          message: `Failed to load member applications. Please refresh the page.`,
          type: "fetch_error",
          createdAt: Timestamp.now(),
          read: false
        });
      }

      // Log error
      if (currentUser) {
        await recordActivityLog({
          action: 'Fetch Applications Error',
          details: `Failed to load pending applications: ${error}`,
          userId: currentUser.uid,
          userEmail: currentUser.email || undefined,
          category: 'user',
          severity: 'medium'
        });
      }
    } finally {
      setIsLoading(false)
    }
  }, [currentUser, userDocId])

  // --- Enhanced Fetch User Position Function ---
  const fetchUserPosition = useCallback(async () => {
    setIsLoadingPosition(true)
    try {
      const user = auth.currentUser
      console.log("Current user:", user)

      if (user) {
        setCurrentUser(user) // Store the current user
        console.log("Fetching position for user ID:", user.uid)
        
        // Get user document ID for notifications
        try {
          const adminUsersRef = collection(db, 'adminUsers');
          const q = query(adminUsersRef, where('uid', '==', user.uid));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            setUserDocId(querySnapshot.docs[0].id);
            const adminData = querySnapshot.docs[0].data();
            fetchUserPosition();
            console.log("Admin user position set to:", adminData.position);
          }
        } catch (error) {
          console.error('Error fetching admin user document:', error);
        }

        // Log page access
        await recordActivityLog({
          action: 'Access Member Approval',
          details: 'Accessed member approval page',
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'user'
        });

        // Check in adminUsers collection first
        const adminUsersQuery = await getDocs(collection(db, "adminUsers"))
        let userFound = false
        
        for (const adminDoc of adminUsersQuery.docs) {
          const adminData = adminDoc.data()
          if (adminData.uid === user.uid) {
            console.log("Admin user document data:", adminData)
            fetchUserPosition()
            console.log("Admin user position set to:", adminData.position)
            userFound = true
            break
          }
        }

        // If not found in adminUsers, check ApprovedUsers
        if (!userFound) {
          const userDocRef = doc(db, "ApprovedUsers", user.uid)
          const userDoc = await getDoc(userDocRef)

          console.log("User document exists in ApprovedUsers:", userDoc.exists())

          if (userDoc.exists()) {
            const data = userDoc.data()
            console.log("User document data:", data)
            console.log("Position field value:", data.position)

            fetchUserPosition()
            console.log("User position set to:", data.position)
          } else {
            console.log("User document does not exist in either collection")
            fetchUserPosition()
          }
        }
      } else {
        console.log("No authenticated user found")
        setCurrentUser(null)
        fetchUserPosition()
        setUserDocId(null)
      }
    } catch (error) {
      console.error("Error fetching user position:", error)
      setError("Failed to fetch user permissions.")
    } finally {
      setIsLoadingPosition(false)
    }
  }, [])

  useEffect(() => {
    // Wait for auth state to be ready before fetching position
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        console.log("Auth state changed, user is authenticated:", user.uid)
        fetchUserPosition()
      } else {
        console.log("Auth state changed, no user authenticated")
        setCurrentUser(null)
        fetchUserPosition()
        setUserDocId(null)
        setIsLoadingPosition(false)
      }
    })

    return () => unsubscribe()
  }, [fetchUserPosition])

  useEffect(() => {
    if (currentUser) {
      fetchMembers()
    }
  }, [currentUser, fetchMembers])

  // --- Enhanced Sorting Logic ---
  const handleSort = async (key: keyof Member) => {
    let direction: "asc" | "desc" = "asc"
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc"
    }
    setSortConfig({ key, direction })

    // Log sort action
    if (currentUser) {
      await recordActivityLog({
        action: 'Sort Applications',
        details: `Sorted member applications by ${key} in ${direction} order`,
        userId: currentUser.uid,
        userEmail: currentUser.email || undefined,
        category: 'user'
      });
    }
  }

  const getSortedMembers = () => {
    return [...members].sort((a, b) => {
      const aValue = a[sortConfig.key] || ""
      const bValue = b[sortConfig.key] || ""

      // Handle string comparison (case-insensitive)
      if (typeof aValue === "string" && typeof bValue === "string") {
        const aStr = aValue.toLowerCase()
        const bStr = bValue.toLowerCase()
        if (aStr < bStr) return sortConfig.direction === "asc" ? -1 : 1
        if (aStr > bStr) return sortConfig.direction === "asc" ? 1 : -1
        return 0
      }

      // Default comparison
      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1
      return 0
    })
  }

  // --- Enhanced Filtering Logic ---
  const getFilteredMembers = () => {
    const sortedMembers = getSortedMembers()
    if (!searchQuery.trim()) return sortedMembers

    const query = searchQuery.toLowerCase().trim()
    return sortedMembers.filter((member) => {
      const fullName = [
        member.firstName,
        member.middleName,
        member.lastName,
        member.suffix && member.suffix.toLowerCase() !== "n/a" ? member.suffix : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      const fullAddress = `${member.barangay} ${member.city} ${member.province}`.toLowerCase()

      return (
        fullName.includes(query) ||
        member.email.toLowerCase().includes(query) ||
        member.skId.toLowerCase().includes(query) ||
        member.contact.includes(query) ||
        fullAddress.includes(query)
      )
    })
  }

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    // Log search action (debounced to avoid too many logs)
    if (currentUser && query.length > 2) {
      await recordActivityLog({
        action: 'Search Applications',
        details: `Searched member applications with query: "${query}"`,
        userId: currentUser.uid,
        userEmail: currentUser.email || undefined,
        category: 'user'
      });
    }
  };

  // --- Enhanced Event Handlers ---
  const handleActionChange = async (memberId: string, value: ActionType) => {
    if (value === "disapprove") {
      setCurrentDisapprovalMember(memberId)
      setDisapprovalMessage("")
      setShowDisapprovalModal(true)
    } else {
      setActions((prev) => ({
        ...prev,
        [memberId]: { action: value },
      }))

      // Log action selection
      if (currentUser && value !== "none") {
        const member = members.find(m => m.id === memberId);
        await recordActivityLog({
          action: 'Select Member Action',
          details: `Selected ${value} action for member: ${member?.firstName} ${member?.lastName} (${member?.skId})`,
          userId: currentUser.uid,
          userEmail: currentUser.email || undefined,
          category: 'user'
        });
      }
    }
  }

  const handleDisapprovalSubmit = async () => {
    if (disapprovalMessage.trim() === "") {
      setError("Please provide a reason for disapproval.")
      setTimeout(() => setError(null), 3000)
      return
    }

    setActions((prev) => ({
      ...prev,
      [currentDisapprovalMember]: { 
        action: "disapprove", 
        disapprovalMessage: disapprovalMessage.trim() 
      },
    }))

    // Log disapproval action
    if (currentUser) {
      const member = members.find(m => m.id === currentDisapprovalMember);
      await recordActivityLog({
        action: 'Set Disapproval Reason',
        details: `Set disapproval reason for member: ${member?.firstName} ${member?.lastName} - "${disapprovalMessage.trim()}"`,
        userId: currentUser.uid,
        userEmail: currentUser.email || undefined,
        category: 'user'
      });
    }

    setShowDisapprovalModal(false)
    setCurrentDisapprovalMember("")
    setDisapprovalMessage("")
  }

  const handleSelectAllAction = async (action: ActionType) => {
    const filteredMembers = getFilteredMembers()
    const newActions: Record<string, ActionData> = {}
    filteredMembers.forEach((member) => {
      if (action === "disapprove") {
        // For bulk disapproval, we'll set a generic message
        newActions[member.id] = { 
          action, 
          disapprovalMessage: "Application did not meet the required criteria." 
        }
      } else {
        newActions[member.id] = { action }
      }
    })
    setActions(newActions)

    // Log bulk action
    if (currentUser) {
      await recordActivityLog({
        action: 'Bulk Select Actions',
        details: `Selected ${action} action for ${filteredMembers.length} members`,
        userId: currentUser.uid,
        userEmail: currentUser.email || undefined,
        category: 'user'
      });
    }
  }

  const handleClearActions = async () => {
    const actionCount = Object.keys(actions).length;
    setActions({})

    // Log clear action
    if (currentUser && actionCount > 0) {
      await recordActivityLog({
        action: 'Clear All Actions',
        details: `Cleared ${actionCount} selected actions`,
        userId: currentUser.uid,
        userEmail: currentUser.email || undefined,
        category: 'user'
      });
    }
  }

  const handleConfirmAll = () => {
    const hasActions = Object.values(actions).some((actionData) => actionData.action !== "none")
    if (hasActions) {
      setShowConfirmAllModal(true)
    } else {
      setError("Please select an action for at least one member.")
      setTimeout(() => setError(null), 3000)
    }
  }

  const handleViewID = async (member: Member) => {
    setSelectedMember(member);

    // Log ID view action
    if (currentUser) {
      await recordActivityLog({
        action: 'View Member ID',
        details: `Viewed ID documents for member: ${member.firstName} ${member.lastName} (${member.skId})`,
        userId: currentUser.uid,
        userEmail: currentUser.email || undefined,
        category: 'user'
      });
    }
  };

  // Send approval email with credentials
  const sendApprovalEmail = async (member: Member, tempPassword: string) => {
    try {
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1167B1; color: white; padding: 20px; text-align: center;">
            <h1>SK Central System</h1>
            <h2>Account Approval Notification</h2>
          </div>
          
          <div style="padding: 20px; background-color: #f9f9f9;">
            <h3 style="color: #1167B1;">Congratulations! Your Account Has Been Approved</h3>
            
            <p>Dear ${member.firstName} ${member.lastName},</p>
            
            <p>We are pleased to inform you that your SK constituent account has been approved. You can now access the SK Central System with your credentials.</p>
            
            <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 10px 0;">
              <h4 style="color: #1167B1; margin-top: 0;">Your Account Credentials</h4>
              <p><strong>SK ID:</strong> ${member.skId}</p>
              <p><strong>Email:</strong> ${member.email}</p>
              <p><strong>Temporary Password:</strong> <span style="background-color: #e6f3ff; padding: 2px 5px; font-family: monospace; font-weight: bold;">SKcentralmarikina2025</span></p>
            </div>
            
            <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 10px 0; border-left: 4px solid #ffc107;">
              <h4 style="color: #856404; margin-top: 0;">Important Security Notice</h4>
              <p style="color: #856404; margin: 0;">Please change your password after your first login for security purposes. Keep your credentials safe and do not share them with anyone.</p>
            </div>
            
            <div style="text-align: center; margin: 20px 0;">
              <p>You can now access the SK Central System using your credentials above.</p>
            </div>
            
            <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 10px 0;">
              <h4 style="color: #1167B1; margin-top: 0;">Your Profile Information</h4>
              <p><strong>Name:</strong> ${member.firstName} ${member.middleName} ${member.lastName} ${member.suffix}</p>
              <p><strong>Address:</strong> ${member.barangay}, ${member.city}, ${member.province}</p>
              <p><strong>Contact:</strong> ${member.contact}</p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
              <p style="color: #666; font-size: 12px;">
                This is an automated notification from SK Central System.<br>
                If you have any questions, please contact your local SK office.
              </p>
            </div>
          </div>
        </div>
      `;

      await sendEmailDirectly({
        to: member.email,
        subject: `SK Account Approved - Welcome ${member.firstName}!`,
        html: htmlContent,
      });

      console.log(`Approval email sent to ${member.email}`);
    } catch (emailError) {
      console.error(`Failed to send approval email to ${member.email}:`, emailError);
      // Don't fail the entire process if email fails
    }
  };

  // Send disapproval email with reason
  const sendDisapprovalEmail = async (member: Member, reason: string) => {
    try {
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center;">
            <h1>SK Central System</h1>
            <h2>Account Application Status</h2>
          </div>
          
          <div style="padding: 20px; background-color: #f9f9f9;">
            <h3 style="color: #dc3545;">Application Not Approved</h3>
            
            <p>Dear ${member.firstName} ${member.lastName},</p>
            
            <p>Thank you for your interest in joining the SK Central System. After careful review, we regret to inform you that your application has not been approved at this time.</p>
            
            <div style="background-color: #f8d7da; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #dc3545;">
              <h4 style="color: #721c24; margin-top: 0;">Reason for Disapproval</h4>
              <p style="color: #721c24; margin: 0; font-weight: 500;">${reason}</p>
            </div>
            
            <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
              <h4 style="color: #1167B1; margin-top: 0;">What You Can Do</h4>
              <p>If you believe this decision was made in error or if you have additional information that might support your application, please contact your local SK office.</p>
              <p>You may also reapply in the future once you have addressed the concerns mentioned above.</p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
              <p style="color: #666; font-size: 12px;">
                This is an automated notification from SK Central System.<br>
                For questions or concerns, please contact your local SK office.
              </p>
            </div>
          </div>
        </div>
      `;

      await sendEmailDirectly({
        to: member.email,
        subject: `SK Application Status - ${member.firstName} ${member.lastName}`,
        html: htmlContent,
      });

      console.log(`Disapproval email sent to ${member.email}`);
    } catch (emailError) {
      console.error(`Failed to send disapproval email to ${member.email}:`, emailError);
      // Don't fail the entire process if email fails
    }
  };

  // --- Enhanced Action Handler ---
  const handleConfirmAllActions = async () => {
    if (!currentUser) {
      setError("No authenticated user found. Please log in again.")
      return
    }

    setIsProcessing(true)
    setError(null)

    const selectedActions = Object.values(actions).filter(actionData => actionData.action !== "none");
    const approvalCount = selectedActions.filter(action => action.action === "approve").length;
    const disapprovalCount = selectedActions.filter(action => action.action === "disapprove").length;

    try {
      const promises = members.map(async (member) => {
        const actionData = actions[member.id]
        if (!actionData || actionData.action === "none") return

        const originalDocRef = doc(db, "conUsers", member.id)

        if (actionData.action === "approve") {
          // Generate temporary password
          const tempPassword = generatePassword();
          
          const approvedDocRef = doc(db, "ApprovedUsers", member.id)
          const { id, ...memberData } = member
          const approvedMemberData = {
            ...memberData,
            isApproved: true,
            approvedAt: Timestamp.now(),
            approvedByUID: currentUser.uid, // Store the UID of the approving user
            tempPassword: tempPassword, // Store temporary password
            uid: member.id, // Add uid for reference
          }
          await setDoc(approvedDocRef, approvedMemberData)
          await deleteDoc(originalDocRef)

          // Send approval email with credentials
          if (isEmailConfigured) {
            try {
              await sendApprovalEmail(member, tempPassword);
            } catch (emailError) {
              console.error(`Failed to send approval email to ${member.email}:`, emailError);
              // Don't fail the entire process if email fails
            }
          } else {
            console.warn('Email not configured, skipping approval email');
          }
        } else if (actionData.action === "disapprove") {
          await deleteDoc(originalDocRef)

          // Send disapproval email with reason
          if (isEmailConfigured && actionData.disapprovalMessage) {
            try {
              await sendDisapprovalEmail(member, actionData.disapprovalMessage);
            } catch (emailError) {
              console.error(`Failed to send disapproval email to ${member.email}:`, emailError);
              // Don't fail the entire process if email fails
            }
          } else {
            console.warn('Email not configured or no disapproval message, skipping disapproval email');
          }
        }
      })

      await Promise.all(promises)

      // Create success notification
      if (userDocId) {
        await addDoc(collection(db, "notifications"), {
          userId: userDocId,
          message: `Successfully processed ${selectedActions.length} member applications (${approvalCount} approved, ${disapprovalCount} disapproved)`,
          type: "approval_success",
          createdAt: Timestamp.now(),
          read: false
        });
      }

      // Log successful processing
      await recordActivityLog({
        action: 'Process Member Applications',
        details: `Successfully processed ${selectedActions.length} applications: ${approvalCount} approved, ${disapprovalCount} disapproved`,
        userId: currentUser.uid,
        userEmail: currentUser.email || undefined,
        category: 'user'
      });

      await fetchMembers()
      setShowConfirmAllModal(false)
      setShowSuccessModal(true)
    } catch (error) {
      console.error("Error confirming actions: ", error)
      setError("An error occurred while processing actions. Please try again.")
      
      // Create error notification
      if (userDocId) {
        await addDoc(collection(db, "notifications"), {
          userId: userDocId,
          message: `Failed to process member applications. Please try again.`,
          type: "approval_error",
          createdAt: Timestamp.now(),
          read: false
        });
      }

      // Log error
      await recordActivityLog({
        action: 'Process Applications Error',
        details: `Failed to process member applications: ${error}`,
        userId: currentUser.uid,
        userEmail: currentUser.email || undefined,
        category: 'user',
        severity: 'high'
      });
    } finally {
      setIsProcessing(false)
    }
  }

  const getSortIcon = (columnKey: keyof Member) => {
    if (sortConfig.key !== columnKey) {
      return <span className="ml-1 text-gray-400">↕</span>
    }
    return sortConfig.direction === "asc" ? <span className="ml-1">↑</span> : <span className="ml-1">↓</span>
  }

  const filteredMembers = getFilteredMembers()
  const selectedActionsCount = Object.values(actions).filter((actionData) => actionData.action !== "none").length

  const formatFullName = (member: Member) => {
    return [
      member.firstName,
      member.middleName,
      member.lastName,
      member.suffix && member.suffix.toLowerCase() !== "n/a" ? member.suffix : "",
    ]
      .filter(Boolean)
      .join(" ")
  }

  const formatFullAddress = (member: Member) => {
    return `${member.barangay}, ${member.city}, ${member.province}`
  }

  if (isLoadingPosition) {
    return (
      <RequireAuth>
        <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] flex items-center justify-center">
          <LoadingSpinner />
        </div>
      </RequireAuth>
    )
  }

  return (
    <RequireAuth>
      <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-semibold text-black">Member Approval</h1>
            <p className="text-lg text-gray-800 mt-1">
              Reviewing and managing member requests ({filteredMembers.length} constituents)
            </p>
            {/* Add link to approved users */}
            <div className="mt-2">
              <button
                onClick={async () => {
                  if (currentUser) {
                    await recordActivityLog({
                      action: 'Navigate to Youth Profiling',
                      details: 'Navigated from Member Approval to Youth Profiling page',
                      userId: currentUser.uid,
                      userEmail: currentUser.email || undefined,
                      category: 'navigation'
                    });
                  }
                  window.location.href = '/youth-profiling';
                }}
                className="text-[#1167B1] hover:text-[#0e5a99] underline text-sm"
              >
                → View Approved Users
              </button>
            </div>
            {currentUser && (
              <div className="mt-2 text-sm text-gray-600">
                Approving as: <span className="font-medium">{currentUser.uid}</span>
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}
        
        {/* Main Content Card */}
        <div className="bg-white rounded-2xl shadow-md p-6 w-full overflow-x-auto">
          <h1 className="text-lg font-semibold text-black mb-4">SK Constituents List</h1>

          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4">
            <div className="flex flex-col sm:flex-row gap-2 flex-1">
              <input
                type="text"
                placeholder="Search by name, email, SK ID, contact, or address..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm flex-1 min-w-64"
              />
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>Showing {filteredMembers.length} of {members.length} applications</span>
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      if (currentUser) {
                        recordActivityLog({
                          action: 'Clear Search',
                          details: 'Cleared search filters in member approval',
                          userId: currentUser.uid,
                          userEmail: currentUser.email || undefined,
                          category: 'user'
                        });
                      }
                    }}
                    className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600 transition text-xs"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSelectAllAction("approve")}
                  className="bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-700 transition whitespace-nowrap"
                >
                  Select All Approve
                </button>
                <button
                  onClick={() => handleSelectAllAction("disapprove")}
                  className="bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-700 transition whitespace-nowrap"
                >
                  Select All Disapprove
                </button>
                <button
                  onClick={handleClearActions}
                  className="bg-gray-600 text-white px-3 py-2 rounded text-sm hover:bg-gray-700 transition whitespace-nowrap"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {selectedActionsCount > 0 && (
                <span className="text-sm text-gray-600">
                  {selectedActionsCount} action{selectedActionsCount !== 1 ? "s" : ""} selected
                </span>
              )}
              <button
                onClick={handleConfirmAll}
                disabled={selectedActionsCount === 0 || isProcessing || !currentUser}
                className="bg-[#1167B1] text-white px-4 py-2 rounded hover:bg-[#0e5a99] transition disabled:bg-gray-400 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isProcessing ? "Processing..." : "Confirm Actions"}
              </button>
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <LoadingSpinner />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1000px] w-full text-sm text-left">
                <thead style={{ backgroundColor: "#1167B1" }} className="text-white font-semibold">
                  <tr>
                    <th
                      className="px-4 py-3 cursor-pointer hover:bg-[#0e5a99] transition"
                      onClick={() => handleSort("firstName")}
                    >
                      Name {getSortIcon("firstName")}
                    </th>
                    <th
                      className="px-4 py-3 cursor-pointer hover:bg-[#0e5a99] transition"
                      onClick={() => handleSort("skId")}
                    >
                      SK ID {getSortIcon("skId")}
                    </th>
                    <th
                      className="px-4 py-3 cursor-pointer hover:bg-[#0e5a99] transition"
                      onClick={() => handleSort("birthday")}
                    >
                      Birthday {getSortIcon("birthday")}
                    </th>
                    <th
                      className="px-4 py-3 cursor-pointer hover:bg-[#0e5a99] transition"
                      onClick={() => handleSort("barangay")}
                    >
                      Address {getSortIcon("barangay")}
                    </th>
                    <th
                      className="px-4 py-3 cursor-pointer hover:bg-[#0e5a99] transition"
                      onClick={() => handleSort("email")}
                    >
                      Email {getSortIcon("email")}
                    </th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">ID Picture</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                        {searchQuery ? `No constituents found matching "${searchQuery}"` : "No constituents available."}
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((member, index) => (
                      <tr key={member.id} className={index % 2 === 0 ? "bg-white hover:bg-gray-50" : "bg-[#e6f3ff] hover:bg-blue-50"}>
                        <td className="px-4 py-3 text-black font-medium">{formatFullName(member)}</td>
                        <td className="px-4 py-3 text-black font-mono">{member.skId}</td>
                        <td className="px-4 py-3 text-black">{member.birthday}</td>
                        <td className="px-4 py-3 text-black">{formatFullAddress(member)}</td>
                        <td className="px-4 py-3 text-black">{member.email}</td>
                        <td className="px-4 py-3 text-black">{member.contact}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleViewID(member)}
                            className="bg-[#1167B1] text-white text-xs px-3 py-1 rounded hover:bg-[#0e5a99] transition"
                          >
                            View ID
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <select
                              value={actions[member.id]?.action || "none"}
                              onChange={(e) => handleActionChange(member.id, e.target.value as ActionType)}
                              className={`border px-3 py-2 rounded text-sm w-full text-black font-semibold transition ${
                                actions[member.id]?.action === "approve"
                                  ? "border-green-500 bg-green-50"
                                  : actions[member.id]?.action === "disapprove"
                                    ? "border-red-500 bg-red-50"
                                    : "border-gray-300"
                              }`}
                            >
                              <option value="none">Select Action</option>
                              <option value="approve">✓ Approve</option>
                              <option value="disapprove">✗ Disapprove</option>
                            </select>
                            {actions[member.id]?.action === "disapprove" && actions[member.id]?.disapprovalMessage && (
                              <div className="text-xs text-red-600 bg-red-50 p-1 rounded border">
                                <strong>Reason:</strong> {actions[member.id]?.disapprovalMessage}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary Statistics */}
          {!isLoading && filteredMembers.length > 0 && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                <div className="text-center">
                  <span className="font-semibold text-[#1167B1]">{members.length}</span>
                  <p className="text-gray-600">Total Applications</p>
                </div>
                <div className="text-center">
                  <span className="font-semibold text-green-600">
                    {Object.values(actions).filter(a => a.action === 'approve').length}
                  </span>
                  <p className="text-gray-600">Selected for Approval</p>
                </div>
                <div className="text-center">
                  <span className="font-semibold text-red-600">
                    {Object.values(actions).filter(a => a.action === 'disapprove').length}
                  </span>
                  <p className="text-gray-600">Selected for Disapproval</p>
                </div>
                <div className="text-center">
                  <span className="font-semibold text-[#1167B1]">
                    {new Set(members.map(m => m.barangay)).size}
                  </span>
                  <p className="text-gray-600">Unique Barangays</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* --- Disapproval Message Modal --- */}
        {showDisapprovalModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#e7f0fa] rounded-2xl w-full max-w-md p-6 shadow-lg border-2 border-[#0A2F7A] relative">
              <button
                onClick={() => {
                  setShowDisapprovalModal(false)
                  setCurrentDisapprovalMember("")
                  setDisapprovalMessage("")
                }}
                className="absolute top-4 right-4 text-white bg-red-600 rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-700 transition"
              >
                ✕
              </button>

              <h2 className="text-2xl font-bold text-black mb-4 text-center mt-2">Disapproval Reason</h2>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Please provide a reason for disapproving this application:
                </label>
                <textarea
                  value={disapprovalMessage}
                  onChange={(e) => setDisapprovalMessage(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none"
                  rows={4}
                  placeholder="e.g., Invalid ID documents, Incorrect personal information, Does not meet age requirements, etc."
                />
              </div>

              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                <p className="text-sm text-yellow-800 text-center">
                  This message will be sent to the applicant via email to explain the reason for disapproval.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDisapprovalModal(false)
                    setCurrentDisapprovalMember("")
                    setDisapprovalMessage("")
                  }}
                  className="flex-1 bg-gray-500 text-white text-lg font-semibold py-3 rounded-md hover:bg-gray-600 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDisapprovalSubmit}
                  className="flex-1 bg-red-600 text-white text-lg font-semibold py-3 rounded-md hover:bg-red-700 transition"
                >
                  Confirm Disapproval
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- Enhanced ID Modal --- */}
        {selectedMember && (
          <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#e7f0fa] rounded-2xl w-full max-w-4xl max-h-[90vh] p-6 shadow-lg border-2 border-[#0A2F7A] relative overflow-y-auto">
              <button
                onClick={() => setSelectedMember(null)}
                className="absolute top-4 right-4 text-white bg-red-600 rounded-full w-8 h-8 flex items-center justify-center font-bold hover:bg-red-700 transition z-10"
              >
                ✕
              </button>

              <h2 className="text-2xl font-bold text-black mb-6 text-center pr-12">
                ID Documents - {formatFullName(selectedMember)}
              </h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="flex flex-col items-center">
                  <div className="w-full aspect-video flex items-center justify-center border-2 border-[#0A2F7A] rounded-lg p-2 bg-white relative">
                    {selectedMember.frontIDUrl ? (
                      <Image
                        src={selectedMember.frontIDUrl || "/placeholder.svg"}
                        alt="Front ID"
                        fill
                        className="object-contain rounded"
                        onError={(e) => {
                          e.currentTarget.style.display = "none"
                          const nextElement = e.currentTarget.parentElement?.querySelector(".error-message")
                          if (nextElement) nextElement.classList.remove("hidden")
                        }}
                      />
                    ) : null}
                    {!selectedMember.frontIDUrl && <p className="text-gray-500">No Front ID Image Available</p>}
                    <p className="text-gray-500 error-message hidden absolute inset-0 flex items-center justify-center">
                      Failed to load Front ID Image
                    </p>
                  </div>
                  <span className="mt-3 text-center text-black font-semibold">Front ID</span>
                </div>

                <div className="flex flex-col items-center">
                  <div className="w-full aspect-video flex items-center justify-center border-2 border-[#0A2F7A] rounded-lg p-2 bg-white relative">
                    {selectedMember.backIDUrl ? (
                      <Image
                        src={selectedMember.backIDUrl || "/placeholder.svg"}
                        alt="Back ID"
                        fill
                        className="object-contain rounded"
                        onError={(e) => {
                          e.currentTarget.style.display = "none"
                          const nextElement = e.currentTarget.parentElement?.querySelector(".error-message")
                          if (nextElement) nextElement.classList.remove("hidden")
                        }}
                      />
                    ) : null}
                    {!selectedMember.backIDUrl && <p className="text-gray-500">No Back ID Image Available</p>}
                    <p className="text-gray-500 error-message hidden absolute inset-0 flex items-center justify-center">
                      Failed to load Back ID Image
                    </p>
                  </div>
                  <span className="mt-3 text-center text-black font-semibold">Back ID</span>
                </div>
              </div>

              {/* Additional member info */}
              <div className="mt-6 p-4 bg-white rounded-lg border border-gray-200">
                <h3 className="font-semibold text-black mb-3">Constituent Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
                  <div>
                    <span className="font-medium">SK ID:</span> {selectedMember.skId}
                  </div>
                  <div>
                    <span className="font-medium">Age:</span> {selectedMember.age}
                  </div>
                  <div>
                    <span className="font-medium">Gender:</span> {selectedMember.gender}
                  </div>
                  <div>
                    <span className="font-medium">Contact:</span> {selectedMember.contact}
                  </div>
                  <div>
                    <span className="font-medium">Email:</span> {selectedMember.email}
                  </div>
                  <div>
                    <span className="font-medium">Birthday:</span> {selectedMember.birthday}
                  </div>
                </div>
                <div className="mt-2">
                  <div>
                    <span className="font-medium">Address:</span> {formatFullAddress(selectedMember)}
                  </div>
                </div>
                {selectedMember.submittedAt && (
                  <div className="mt-2">
                    <div>
                      <span className="font-medium">Submitted:</span>{" "}
                      {selectedMember.submittedAt.toDate().toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- Enhanced Confirmation Modal --- */}
        {showConfirmAllModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#e7f0fa] rounded-2xl w-full max-w-md p-6 shadow-lg border-2 border-[#0A2F7A] relative">
              <button
                onClick={() => setShowConfirmAllModal(false)}
                className="absolute top-4 right-4 text-white bg-red-600 rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-700 transition"
                disabled={isProcessing}
              >
                ✕
              </button>

              <h2 className="text-2xl font-bold text-black mb-4 text-center mt-2">Confirm Actions</h2>

              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                <p className="text-sm text-yellow-800 text-center">
                  You are about to process {selectedActionsCount} action{selectedActionsCount !== 1 ? "s" : ""} for SK
                  constituents. This cannot be undone.
                  {isEmailConfigured ? " Users will receive email notifications about their application status." : " Note: Email notifications are disabled."}
                </p>
                {currentUser && (
                  <p className="text-sm text-blue-800 text-center mt-2">
                    Approvals will be tracked with your UID: <span className="font-mono">{currentUser.uid}</span>
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmAllModal(false)}
                  className="flex-1 bg-gray-500 text-white text-lg font-semibold py-3 rounded-md hover:bg-gray-600 transition"
                  disabled={isProcessing}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmAllActions}
                  className="flex-1 bg-[#1167B1] text-white text-lg font-semibold py-3 rounded-md hover:bg-[#0e5290] transition disabled:bg-gray-400"
                  disabled={isProcessing || !currentUser}
                >
                  {isProcessing ? "Processing..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- Enhanced Success Modal --- */}
        {showSuccessModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#e7f0fa] rounded-2xl w-full max-w-md p-6 shadow-lg border-2 border-[#0A2F7A] relative">
              <button
                onClick={() => setShowSuccessModal(false)}
                className="absolute top-4 right-4 text-white bg-red-600 rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-700 transition"
              >
                ✕
              </button>

              <div className="text-center">
                <div className="mx-auto mb-4 w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-green-600 text-2xl">✓</span>
                </div>
                <h2 className="text-2xl font-bold text-black mb-2">Success!</h2>
                <p className="text-gray-600 mb-4">
                  All actions have been processed successfully. The constituents list has been updated.
                  {isEmailConfigured ? " Users have been notified about their application status via email." : ""}
                  {currentUser && (
                    <span className="block mt-2 text-sm">
                      Approvals tracked under UID: <span className="font-mono text-blue-600">{currentUser.uid}</span>
                    </span>
                  )}
                </p>
                <button
                  onClick={() => setShowSuccessModal(false)}
                  className="bg-[#1167B1] text-white px-6 py-2 rounded-md hover:bg-[#0e5290] transition"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Navbar />
    </RequireAuth>
  )
}