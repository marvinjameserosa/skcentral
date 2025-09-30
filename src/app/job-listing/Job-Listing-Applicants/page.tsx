"use client";

import { useState, useEffect, Suspense } from "react";
import { db } from "@/app/Firebase/firebase";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import Navbar from "../../Components/Navbar";
import { useRouter, useSearchParams } from "next/navigation";
import RequireAuth from "@/app/Components/RequireAuth";
import { recordActivityLog } from "@/app/Components/recordActivityLog";

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

interface JobListing {
  id: string;
  position: string;
  companyEmail: string;
  company: string;
}

const auth = getAuth();

// 🔹 Inner component that actually uses useSearchParams()
function JobListingApplicantsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [jobListings, setJobListings] = useState<JobListing[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [jobPosition, setJobPosition] = useState<string>("");
  const [, setEmployerEmail] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Fetch job listings
  useEffect(() => {
    const fetchJobListings = async () => {
      try {
        const jobListingsSnapshot = await getDocs(collection(db, "jobListings"));
        const jobListingsData = jobListingsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as JobListing[];

        setJobListings(jobListingsData);

        // Log activity
        await recordActivityLog({
          action: "View Job Applicants Page",
          details: `Accessed job applicants management for ${jobListingsData.length} positions`,
          userId: "currentUserId", // Replace with actual user ID
          category: "jobs",
        });
      } catch (error) {
        console.error("Error fetching job listings:", error);
      }
    };

    fetchJobListings();
  }, []);

  // Handle job selection from URL params
  useEffect(() => {
    const jobId = searchParams.get("jobId");
    if (jobId && jobListings.length > 0) {
      const selectedJob = jobListings.find((job) => job.id === jobId);
      if (selectedJob) {
        setSelectedJobId(jobId);
        setJobPosition(selectedJob.position);
        setEmployerEmail(selectedJob.companyEmail);
      }
    }
  }, [searchParams, jobListings]);

  // Fetch applicants for the selected job
  useEffect(() => {
    const fetchApplicants = async () => {
      if (!selectedJobId) return;

      setLoading(true);
      try {
        const applicantsQuery = query(
          collection(db, "jobApplicants"),
          where("jobId", "==", selectedJobId)
        );
        const applicantsSnapshot = await getDocs(applicantsQuery);

        const applicantsData = applicantsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Applicant[];

        setApplicants(applicantsData);

        // Log activity
        await recordActivityLog({
          action: "Load Job Applicants",
          details: `Loaded ${applicantsData.length} applicants for position: ${jobPosition}`,
          userId: "currentUserId", // Replace with actual user ID
          category: "jobs",
        });
      } catch (error) {
        console.error("Error fetching applicants:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchApplicants();
  }, [selectedJobId, jobPosition]);

  // Auth state change listener
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        await recordActivityLog({
          action: "View Page",
          details: "User accessed the Job Listing Applicants page",
          userId: currentUser.uid,
          userEmail: currentUser.email || undefined,
          category: "user",
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const handleBack = () => {
    router.back();
  };

  const handleJobChange = (jobId: string) => {
    const selectedJob = jobListings.find((job) => job.id === jobId);
    if (selectedJob) {
      setSelectedJobId(jobId);
      setJobPosition(selectedJob.position);
      setEmployerEmail(selectedJob.companyEmail);
    } else {
      setSelectedJobId("");
      setJobPosition("");
      setEmployerEmail("");
    }
  };

  return (
    <RequireAuth>
      <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa]">
        {/* Header */}
        <div className="flex items-center mb-4">
          <button
            onClick={handleBack}
            className="text-[#002C84] text-3xl font-bold mr-3 hover:text-[#1167B1] transition-colors"
          >
            ←
          </button>
          <div>
            <h1 className="text-3xl font-bold text-[#002C84]">
              Job Applicants Management
            </h1>
            <p className="text-gray-700 mt-1">
              Manage and review applications for available job positions.
            </p>
          </div>
        </div>

        {/* Job Selection */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <label className="block text-sm font-semibold text-[#002C84] mb-2">
            Select Job Position
          </label>
          <select
            value={selectedJobId}
            onChange={(e) => handleJobChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1167B1]"
          >
            <option value="">-- Select Job Position --</option>
            {jobListings.map((job) => (
              <option key={job.id} value={job.id}>
                {job.position} - {job.company}
              </option>
            ))}
          </select>
        </div>

        {/* Applicants Table */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-lg font-bold text-[#002C84] mb-4">
            Applicants for {jobPosition || "Selected Job"}
          </h2>
          {loading ? (
            <p className="text-center text-gray-600">Loading applicants...</p>
          ) : applicants.length === 0 ? (
            <p className="text-center text-gray-500">
              No applicants found for this position.
            </p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="bg-[#1167B1] text-white">
                <tr>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Phone</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {applicants.map((applicant) => (
                  <tr key={applicant.id} className="border-b">
                    <td className="px-4 py-2">{applicant.name}</td>
                    <td className="px-4 py-2">{applicant.email}</td>
                    <td className="px-4 py-2">{applicant.phone}</td>
                    <td className="px-4 py-2">{applicant.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Navbar />
      </div>
    </RequireAuth>
  );
}

// 🔹 Export wrapped in Suspense
export default function JobListingApplicants() {
  return (
    <Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
      <JobListingApplicantsContent />
    </Suspense>
  );
}
