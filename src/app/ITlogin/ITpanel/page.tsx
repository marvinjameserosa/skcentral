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
  modules: string[]; // Array of module IDs
};

// Import modules from navbar (you can also move this to a separate constants file)
const modules = [
  {
    id: "youth-profiling",
    title: "Youth Profiling",
    href: "/youth-profiling",
  },
  {
    id: "chat",
    title: "Chat",
    href: "/chat",
  },
  {
    id: "announcement",
    title: "Announcement",
    href: "/announcement",
  },
  {
    id: "community-event",
    title: "Community Event",
    href: "/community-event",
  },
  {
    id: "job-listing",
    title: "Job Listing",
    href: "/job-listing",
  },
  {
    id: "scholarship-listing",
    title: "Scholarship Listing",
    href: "/scholarship-listing",
  },
  {
    id: "transparency-report",
    title: "Transparency Report",
    href: "/transparency-report",
  },
  {
    id: "learning-hub",
    title: "Learning Hub",
    href: "/learningHub",
  },
  {
    id: "feedbacks",
    title: "Feedbacks",
    href: "/feedbacks",
  },
  {
    id: "podcast",
    title: "Podcast",
    href: "/LivePodcast",
  },
  {
    id: "member-approval",
    title: "Member Approval",
    href: "/member-approval",
  },
  {
    id: "user",
    title: "User",
    href: "/user",
  },
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

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    barangay: "",
    position: "",
    birthday: "",
    civilStatus: "",
    gender: "",
    phoneNumber: "",
    modules: defaultModules, // Start with default modules
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

  // Fetch accounts from Firestore
  const fetchAccounts = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "adminUsers"));
      const fetchedAccounts: Account[] = querySnapshot.docs.map(
        (doc: QueryDocumentSnapshot<DocumentData>) => ({
          ...doc.data(),
          id: doc.id,
          modules: doc.data().modules || [], // Ensure modules field exists
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

  // Create new account (Auth + Firestore with UID)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const skId = generateSkId(formData.barangay);
    const newAccount: Account = {
      skId,
      name: formData.name,
      email: formData.email,
      barangay: formData.barangay,
      position: formData.position,
      password: "skcentralmarikina", // Default password
      birthday: formData.birthday,
      civilStatus: formData.civilStatus,
      gender: formData.gender,
      phoneNumber: formData.phoneNumber,
      modules: formData.modules, // Include selected modules
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
        modules: defaultModules, // Reset to default modules
      });
      setShowModal(false);
      setConfirmMessage(
        `Account for ${newAccount.name} created. Temporary password: "skcentralmarikina".`
      );
      setShowSuccessModal(true);
    } catch (error: unknown) {
      console.error("Error adding account: ", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setConfirmMessage(errorMessage || "Error creating account.");
      setShowSuccessModal(true);
    }
  };

  // Open edit modal
  const handleEditClick = (account: Account) => {
    setEditFormData({
      ...account,
      modules: account.modules || [], // Ensure modules field exists
    });
    setShowEditModal(true);
  };

  // Submit edited account (Save button)
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        modules: editFormData.modules, // Update modules
      });

      // Refresh accounts list
      await fetchAccounts();
      setShowEditModal(false);

      // Show success
      setConfirmMessage("Account updated successfully!");
      setShowSuccessModal(true);
    } catch (error: unknown) {
      console.error("Error updating account: ", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setConfirmMessage(errorMessage || "Error updating account.");
      setShowSuccessModal(true);
    }
  };

  // Delete account from Firestore and Auth
  const handleDeleteAccount = async () => {
    try {
      if (!editFormData.id || !editFormData.uid) {
        setConfirmMessage("Account ID or UID missing for archiving.");
        setShowSuccessModal(true);
        return;
      }

      // Archive the account in Firestore by setting an "archived" flag.
      await updateDoc(doc(db, "adminUsers", editFormData.id), {
        archived: true,
      });

      const auth = getAuth();
      const currentUser = auth.currentUser;

      // Note: Disabling a Firebase Auth user must be done server-side.
      // If the current user is the same as the archived account, sign out to prevent further use.
      if (currentUser && currentUser.uid === editFormData.uid) {
        await signOut(auth);
      } else {
        console.warn(
          "Archiving credentials must be handled on the backend. Ensure that archived users cannot log in."
        );
      }

      await fetchAccounts();
      setShowEditModal(false);
      setConfirmMessage("Account archived successfully!");
      setShowSuccessModal(true);
    } catch (error: unknown) {
      console.error("Error archiving account: ", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      setConfirmMessage(errorMessage || "Error archiving account.");
      setShowSuccessModal(true);
    }
  };

  // Handle Reset Password (sends email)
  const handleResetPassword = async () => {
    try {
      if (!editFormData.email || !editFormData.id) {
        setResetPasswordMessage("Account email or ID is missing for password reset.");
        return;
      }
      // Reset the password in the Firestore record to default
      await updateDoc(doc(db, "adminUsers", editFormData.id), {
        password: "skcentralmarikina",
      });
      setResetPasswordMessage(
        `Password for ${editFormData.email} has been reset to default ("skcentralmarikina").`
      );
    } catch (error: unknown) {
      console.error("Error resetting password: ", error);
      setResetPasswordMessage(
        error instanceof Error
          ? error.message
          : "Failed to reset password to default."
      );
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
            <h1 className="text-4xl font-bold text-[#103F91]">
              Configurations of Accounts
            </h1>
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
            >
              ✕
            </button>
            <h2 className="text-2xl font-bold text-[#0A2F7A] mb-4">
              Create New Account
            </h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* User Details */}
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
                  <option value="" disabled>
                    Select Barangay
                  </option>
                  {Object.keys(barangayMapping).map((brgy) => (
                    <option key={brgy} value={brgy}>
                      {brgy}
                    </option>
                  ))}
                </select>
                <select
                  name="position"
                  value={formData.position}
                  onChange={handleInputChange}
                  required
                  className="w-full p-3 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-[#0A2F7A]"
                >
                  <option value="" disabled>
                    Select Position
                  </option>
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
                  <option value="" disabled>
                    Select Civil Status
                  </option>
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
                  <option value="" disabled>
                    Select Gender
                  </option>
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
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#103F91] text-white px-4 py-2 rounded-lg hover:bg-[#0A2F7A]"
                >
                  Save
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
                  <option value="" disabled>
                    Select Barangay
                  </option>
                  {Object.keys(barangayMapping).map((brgy) => (
                    <option key={brgy} value={brgy}>
                      {brgy}
                    </option>
                  ))}
                </select>
                <select
                  name="position"
                  value={editFormData.position}
                  onChange={handleEditInputChange}
                  required
                  className="w-full p-3 rounded-lg border border-gray-300 text-sm outline-none focus:ring-2 focus:ring-[#0A2F7A]"
                >
                  <option value="" disabled>
                    Select Position
                  </option>
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
                  <option value="" disabled>
                    Select Civil Status
                  </option>
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
                  <option value="" disabled>
                    Select Gender
                  </option>
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
                  <p className="text-sm text-center text-[#103F91] font-medium">
                    {resetPasswordMessage}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                </div>
                <div className="flex justify-between gap-2 mt-2">
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    className="bg-yellow-500 text-black px-4 py-2 rounded-lg hover:bg-orange-600 flex-1"
                  >
                    Reset Password
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 flex-1"
                  >
                    Archive Account
                  </button>
                </div>
                                  <button
                    type="submit"
                    className="bg-[#103F91] text-white px-4 py-2 rounded-lg hover:bg-[#0A2F7A]"
                  >
                    Save Changes
                  </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-opacity-50 backdrop-blur-lg flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-[#0A2F7A] w-full max-w-sm text-center">
            <p className="text-[#103F91] font-semibold mb-4">
              {confirmMessage}
            </p>
            <button
              onClick={handleCloseSuccessModal}
              className="bg-[#103F91] text-white px-4 py-2 rounded-lg hover:bg-[#0A2F7A]"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}