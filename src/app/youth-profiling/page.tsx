'use client';

import { useState, useEffect, useCallback } from "react";
import Navbar from "../Components/Navbar";
import RequireAuth from "@/app/Components/RequireAuth";
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";
import { db } from '@/app/Firebase/firebase';
import { getAuth, User } from "firebase/auth";
import { recordActivityLog } from "@/app/Components/recordActivityLog";

type Member = {
  id: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  age: string;
  birthday: string;
  gender: string;
  email: string;
  contact: string;
  barangay: string;
  city: string;
  province: string;
  skId: string;
  frontIDUrl: string;
  backIDUrl: string;
  isApproved: boolean;
  approvedBy: string;
  approvedByUID: string;
  approvedAt: Timestamp | null;
};

export default function ApprovedUsersTable() {
  const [members, setMembers] = useState<Member[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [barangayFilter, setBarangayFilter] = useState("all");
  const [userBarangay, setUserBarangay] = useState<string>("");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({
    key: "firstName",
    direction: "asc",
  });
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const auth = getAuth();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        // Fetch user's barangay from adminUsers collection
        try {
          const adminUsersRef = collection(db, 'adminUsers');
          const q = query(adminUsersRef, where('uid', '==', currentUser.uid));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            const adminData = querySnapshot.docs[0].data();
            const assignedBarangay = adminData.barangay || "";
            setUserBarangay(assignedBarangay);
            // Set default filter to user's barangay if they have one
            if (assignedBarangay) {
              setBarangayFilter(assignedBarangay);
            }
          }
        } catch (error) {
          console.error('Error fetching user barangay:', error);
        }

        // Log page access with specific page name
        await recordActivityLog({
          action: "View Page",
          details: "User accessed the Youth Profiling (Approved Users) page",
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

  // Helper function to get admin user details by UID
  const getAdminUserByUID = async (uid: string): Promise<{ name: string; email: string } | null> => {
    try {
      const adminUsersRef = collection(db, 'adminUsers');
      const q = query(adminUsersRef, where('uid', '==', uid));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const adminData = querySnapshot.docs[0].data();
        return {
          name: `${adminData.firstName || ''} ${adminData.lastName || ''}`.trim() || adminData.email || 'Unknown Admin',
          email: adminData.email || ''
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching admin user:', error);
      return null;
    }
  };

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      const membersQuery = query(
        collection(db, "ApprovedUsers"),
        where("isApproved", "==", true)
      );
      const querySnapshot = await getDocs(membersQuery);
      
      const fetchedMembers: Member[] = await Promise.all(
        querySnapshot.docs.map(async (doc) => {
          const data = doc.data();
          let approvedBy = "Unknown Admin";
          const approvedByUID = data.approvedByUID || data.approvedBy || "";

          // If we have a UID, get the admin user details
          if (approvedByUID) {
            const adminUser = await getAdminUserByUID(approvedByUID);
            if (adminUser) {
              approvedBy = adminUser.name;
            }
          }

          return {
            id: doc.id,
            firstName: data.firstName || "",
            middleName: data.middleName || "",
            lastName: data.lastName || "",
            suffix: data.suffix || "",
            age: data.age || "",
            birthday: data.birthday || "",
            gender: data.gender || "",
            email: data.email || "",
            contact: data.contact || "",
            barangay: data.barangay || "",
            city: data.city || "",
            province: data.province || "",
            skId: data.skId || "",
            frontIDUrl: data.frontIDUrl || "",
            backIDUrl: data.backIDUrl || "",
            isApproved: data.isApproved || false,
            approvedBy,
            approvedByUID,
            approvedAt: data.approvedAt || null,
          };
        })
      );

      setMembers(fetchedMembers);

      // Log successful fetch with cross-reference
      if (user) {
        await recordActivityLog({
          action: 'Fetch Approved Users',
          details: `Successfully loaded ${fetchedMembers.length} approved users from member approval process`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'admin'
        });
      }

    } catch (error) {
      console.error("Error fetching members:", error);
      
      if (user) {
        await recordActivityLog({
          action: 'Fetch Approved Users Error',
          details: `Failed to load approved users: ${error}`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'admin',
          severity: 'medium'
        });
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleSort = async (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });

    // Log sort action
    if (user) {
      await recordActivityLog({
        action: 'Sort Users Table',
        details: `Sorted approved users by ${key} in ${direction} order`,
        userId: user.uid,
        userEmail: user.email || undefined,
        category: 'user'
      });
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    // Log search action (debounced to avoid too many logs)
    if (user && query.length > 2) {
      await recordActivityLog({
        action: 'Search Users',
        details: `Searched approved users with query: "${query}"`,
        userId: user.uid,
        userEmail: user.email || undefined,
        category: 'user'
      });
    }
  };

  const handleBarangayFilter = async (barangay: string) => {
    setBarangayFilter(barangay);

    // Log filter action
    if (user) {
      await recordActivityLog({
        action: 'Filter Users by Barangay',
        details: `Filtered approved users by barangay: ${barangay === 'all' ? 'All Barangays' : barangay}`,
        userId: user.uid,
        userEmail: user.email || undefined,
        category: 'user'
      });
    }
  };

  const sortedMembers = [...members].sort((a, b) => {
    const aValue = a[sortConfig.key as keyof Member] || "";
    const bValue = b[sortConfig.key as keyof Member] || "";
    if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  // Apply barangay filter first, then search filter
  const barangayFilteredMembers = sortedMembers.filter((member) => {
    if (barangayFilter === "all") return true;
    return member.barangay === barangayFilter;
  });

  const filteredMembers = barangayFilteredMembers.filter(
    (member) =>
      member.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.barangay.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.approvedBy.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get unique barangays for the filter dropdown
  const uniqueBarangays = Array.from(new Set(members.map(m => m.barangay))).sort();

  const handleDownload = async () => {
    setIsDownloading(true);
    
    try {
      // Define the CSV header fields
      const headerFields = [
        "firstName",
        "middleName",
        "lastName",
        "suffix",
        "age",
        "birthday",
        "gender",
        "email",
        "contact",
        "barangay",
        "city",
        "province",
        "skId",
        "frontIDUrl",
        "backIDUrl",
        "isApproved",
        "approvedBy",
        "approvedByUID",
        "approvedAt",
      ];
      
      // Convert filtered members to a CSV string
      const csvRows = [
        headerFields.join(","),
        ...filteredMembers.map((member) => {
          const row = headerFields.map((field) => {
            let value = member[field as keyof Member] || "";
            if (field === "approvedAt" && member.approvedAt) {
              value = member.approvedAt.toDate().toLocaleString();
            }
            if (field === "isApproved") {
              value = member.isApproved ? "Yes" : "No";
            }
            return `"${value}"`;
          });
          return row.join(",");
        }),
      ].join("\n");

      // Create a blob and download
      const blob = new Blob([csvRows], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fileName = barangayFilter === "all" 
        ? `approved_users_all_barangays_${new Date().toISOString().split('T')[0]}.csv`
        : `approved_users_${barangayFilter}_${new Date().toISOString().split('T')[0]}.csv`;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      // Log download action
      if (user) {
        await recordActivityLog({
          action: 'Download Users CSV',
          details: `Downloaded CSV file with ${filteredMembers.length} approved users (Barangay: ${barangayFilter})`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'user'
        });
      }

    } catch (error) {
      console.error("Error downloading CSV:", error);

      // Log error
      if (user) {
        await recordActivityLog({
          action: 'Download CSV Error',
          details: `Failed to download CSV: ${error}`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'user',
          severity: 'medium'
        });
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const handleViewID = async (member: Member, idType: 'front' | 'back') => {
    if (user) {
      await recordActivityLog({
        action: 'View User ID',
        details: `Viewed ${idType} ID for user: ${member.firstName} ${member.lastName} (${member.skId})`,
        userId: user.uid,
        userEmail: user.email || undefined,
        category: 'user'
      });
    }
  };

  return (
    <RequireAuth>
      <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-semibold text-gray-800">Youth Profiling</h1>
            <p className="text-lg text-gray-600 mt-1">
              List of all SK constituents ({filteredMembers.length} total)
            </p>
          </div>
        </div>

        {/* Search and Download */}
        <div className="bg-white rounded-2xl shadow-md p-6 w-full overflow-x-auto max-w-full mb-1">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search by name, email, barangay, or approved by..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm w-full sm:w-64 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1167B1]"
              />
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>Showing {filteredMembers.length} of {members.length} users</span>
              </div>
            </div>
            <div className="flex gap-4">
              <select
                value={barangayFilter}
                onChange={(e) => handleBarangayFilter(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1167B1] bg-white"
              >
                <option value="all">All Youth Constituents</option>
                {userBarangay && (
                  <option value={userBarangay}>My Barangay ({userBarangay})</option>
                )}
                {uniqueBarangays.filter(b => b !== userBarangay).map((barangay) => (
                  <option key={barangay} value={barangay}>
                    {barangay}
                  </option>
                ))}
              </select>
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="bg-[#1167B1] text-white px-4 py-2 rounded hover:bg-[#0e5a99] transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isDownloading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Downloading...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd"/>
                    </svg>
                    Download CSV
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Loading State */}
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1167B1]"></div>
            </div>
          ) : (
            /* Table */
            <div className="overflow-x-auto">
              <table className="min-w-[1200px] w-full text-sm text-left">
                <thead style={{ backgroundColor: "#1167B1" }} className="text-white font-semibold">
                  <tr>
                    {[
                      "firstName",
                      "middleName", 
                      "lastName",
                      "suffix",
                      "age",
                      "birthday",
                      "gender",
                      "email",
                      "contact",
                      "barangay",
                      "city",
                      "province",
                      "skId",
                      "frontIDUrl",
                      "backIDUrl",
                      "isApproved",
                      "approvedBy",
                      "approvedAt",
                    ].map((key) => (
                      <th
                        key={key}
                        className="px-4 py-3 cursor-pointer w-[150px] hover:bg-[#0e5a99] transition-colors"
                        onClick={() => handleSort(key)}
                      >
                        <div className="flex items-center gap-1">
                          {key === "approvedBy" ? "Approved By" : 
                           key
                            .replace(/([A-Z])/g, " $1")
                            .replace(/^./, (str) => str.toUpperCase())}
                          <span className="text-xs">
                            {sortConfig.key === key && (
                              sortConfig.direction === "asc" ? "↑" : "↓"
                            )}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={18} className="px-4 py-8 text-center text-gray-500">
                        {searchQuery ? `No users found matching "${searchQuery}"` : 
                         barangayFilter !== "all" ? `No approved users found in ${barangayFilter}` :
                         "No approved users found"}
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((member, index) => (
                      <tr key={member.id} className={index % 2 === 0 ? "bg-white hover:bg-gray-50" : "bg-[#e6f3ff] hover:bg-blue-50"}>
                        <td className="px-4 py-3 font-medium">{member.firstName}</td>
                        <td className="px-4 py-3">{member.middleName}</td>
                        <td className="px-4 py-3 font-medium">{member.lastName}</td>
                        <td className="px-4 py-3">{member.suffix}</td>
                        <td className="px-4 py-3">{member.age}</td>
                        <td className="px-4 py-3">{member.birthday}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            member.gender === 'Male' ? 'bg-blue-100 text-blue-800' : 
                            member.gender === 'Female' ? 'bg-pink-100 text-pink-800' : 
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {member.gender}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#1167B1]">{member.email}</td>
                        <td className="px-4 py-3">{member.contact}</td>
                        <td className="px-4 py-3">
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                            {member.barangay}
                          </span>
                        </td>
                        <td className="px-4 py-3">{member.city}</td>
                        <td className="px-4 py-3">{member.province}</td>
                        <td className="px-4 py-3 font-mono text-xs bg-gray-100 rounded px-2 py-1">{member.skId}</td>
                        <td className="px-4 py-3">
                          {member.frontIDUrl ? (
                            <a 
                              href={member.frontIDUrl} 
                              target="_blank" 
                              rel="noreferrer"
                              onClick={() => handleViewID(member, 'front')}
                              className="text-blue-600 hover:text-blue-800 underline text-sm"
                            >
                              View Front
                            </a>
                          ) : (
                            <span className="text-gray-400 text-sm">No Image</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {member.backIDUrl ? (
                            <a 
                              href={member.backIDUrl} 
                              target="_blank" 
                              rel="noreferrer"
                              onClick={() => handleViewID(member, 'back')}
                              className="text-blue-600 hover:text-blue-800 underline text-sm"
                            >
                              View Back
                            </a>
                          ) : (
                            <span className="text-gray-400 text-sm">No Image</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-semibold">
                            {member.isApproved ? "Yes" : "No"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-medium text-sm text-gray-800">{member.approvedBy}</span>
                            {member.approvedByUID && (
                              <span className="text-xs text-gray-500 font-mono">UID: {member.approvedByUID}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {member.approvedAt?.toDate().toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary Info */}
          {!loading && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <span className="font-semibold text-[#1167B1]">{members.length}</span>
                  <p className="text-gray-600">Total Approved</p>
                </div>
                <div className="text-center">
                  <span className="font-semibold text-[#1167B1]">{filteredMembers.length}</span>
                  <p className="text-gray-600">Currently Showing</p>
                </div>
                <div className="text-center">
                  <span className="font-semibold text-[#1167B1]">
                    {barangayFilter === "all" 
                      ? new Set(members.map(m => m.barangay)).size
                      : 1}
                  </span>
                  <p className="text-gray-600">
                    {barangayFilter === "all" ? "Unique Barangays" : "Selected Barangay"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <Navbar />
      </div>
    </RequireAuth>
  );
}