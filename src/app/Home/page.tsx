'use client';

import React, { useState, useEffect, useMemo } from 'react';
import AreaChartComponent from '../Components/AreaChart';
import BarChartComponent from '../Components/BarChart';
import Navbar from "../Components/Navbar";
import RequireAuth from "@/app/Components/RequireAuth";
import { db } from '../Firebase/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { getAuth, User } from "firebase/auth";
import { recordActivityLog } from "@/app/Components/recordActivityLog";

// Define an interface for your youth data documents based on actual Firestore structure
interface YouthData {
  id: string;
  barangay: string;
  birthday: string;
  age: string;
  gender: string;
  educationalBackground: string;
  youthClassification: string;
  civilStatus: string;
  workStatus: string;
  registeredSkVoter: string;
  registeredNationalVoter: string;
  votedLastElection: string;
  attendedAssembly: string;
  createdAt: { toDate: () => Date };
  youthAgeGroup: string;
}

const auth = getAuth();

// Helper function to calculate age from birthday string
const calculateAge = (birthday: string): number | null => {
  if (!birthday) return null;

  try {
    const birthDate = new Date(birthday);
    if (isNaN(birthDate.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  } catch {
    return null;
  }
};

// Helper function to convert string boolean to actual boolean
const stringToBoolean = (value: string): boolean => {
  return value?.toLowerCase() === 'yes' || value?.toLowerCase() === 'true';
};

// Helper function to normalize strings for comparison
const normalizeString = (str: string): string => {
  return str?.toString().trim().toLowerCase() || '';
};

const YouthInsightsDashboard: React.FC = () => {
  const [barangay, setBarangay] = useState<string>('All');
  const [ageGroup, setAgeGroup] = useState<string>('All');
  const [gender, setGender] = useState<string>('All');
  const [allYouthData, setAllYouthData] = useState<YouthData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [, setUser] = useState<User | null>(null);

  // Authentication and activity logging - ENHANCED VERSION
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      console.log('Auth state changed - Current User:', currentUser); // Debug log
      
      if (currentUser) {
        setUser(currentUser);
        console.log('User authenticated:', currentUser.email); // Debug log

        try {
          console.log('Attempting to record activity log...'); // Debug log
          
          // Log page access with specific page name
          await recordActivityLog({
            action: "View Page",
            details: "User accessed the Youth Insights Dashboard page",
            userId: currentUser.uid,
            userEmail: currentUser.email || undefined,
            category: "user", // Changed to admin since this is an admin dashboard
          });
          
          console.log('✅ Activity log recorded successfully for Youth Insights Dashboard'); // Success log
        } catch (error) {
          console.error('❌ Error recording activity log:', error); // Error log
        }
      } else {
        setUser(null);
        console.log('User not authenticated'); // Debug log
      }
    });

    return () => unsubscribe();
  }, []);

  // Alternative approach - Log activity when component mounts and user is available
  useEffect(() => {
    const logPageVisit = async () => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          console.log('Logging page visit on component mount...'); // Debug log
          
          await recordActivityLog({
            action: "View Page",
            details: "User accessed the Youth Insights Dashboard page",
            userId: currentUser.uid,
            userEmail: currentUser.email || undefined,
            category: "admin",
          });
          
          console.log('✅ Page visit logged on component mount'); // Success log
        } catch (error) {
          console.error('❌ Error logging page visit on mount:', error); // Error log
        }
      }
    };

    // Small delay to ensure auth state is settled
    const timer = setTimeout(logPageVisit, 1000);
    return () => clearTimeout(timer);
  }, []); // Empty dependency array - runs once on mount

  // Fetch all data once on component mount
  useEffect(() => {
    const fetchAllYouthData = async () => {
      setLoading(true);
      setError(null);
      try {
        const youthProfilingRef = collection(db, 'youthProfiling');
        const querySnapshot = await getDocs(youthProfilingRef);

        const fetchedData: YouthData[] = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data() as Omit<YouthData, 'id'>
        }));

        console.log('Fetched data sample:', fetchedData.slice(0, 3));
        setAllYouthData(fetchedData);
      } catch (err: unknown) {
        console.error("Error fetching youth data:", err);
        setError("Failed to load youth data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchAllYouthData();
  }, []);

  // Filter data based on selected filters
  const filteredYouthData = useMemo(() => {
    let filtered = [...allYouthData];

    console.log('Filtering with:', { barangay, ageGroup, gender });
    console.log('Total data before filtering:', filtered.length);

    // Filter by barangay
    if (barangay !== 'All') {
      filtered = filtered.filter(youth => {
        const youthBarangay = normalizeString(youth.barangay);
        const selectedBarangay = normalizeString(barangay);
        return youthBarangay === selectedBarangay;
      });
      console.log('After barangay filter:', filtered.length);
    }

    // Filter by gender
    if (gender !== 'All') {
      filtered = filtered.filter(youth => {
        const youthGender = normalizeString(youth.gender);
        const selectedGender = normalizeString(gender);
        return youthGender === selectedGender;
      });
      console.log('After gender filter:', filtered.length);
    }

    // Filter by age group
    if (ageGroup !== 'All') {
      filtered = filtered.filter(youth => {
        // First try to use the youthAgeGroup field if it exists and matches
        if (youth.youthAgeGroup && normalizeString(youth.youthAgeGroup) === normalizeString(ageGroup)) {
          return true;
        }
        
        // Fallback to calculating age from birthday or age field
        let age: number | null = null;
        
        if (youth.age && !isNaN(parseInt(youth.age))) {
          age = parseInt(youth.age);
        } else if (youth.birthday) {
          age = calculateAge(youth.birthday);
        }
        
        if (age === null) return false;

        // Match age ranges
        switch (ageGroup) {
          case 'Child Youth (15-17 yrs old)':
            return age >= 15 && age <= 17;
          case 'Core Youth (18-24 yrs old)':
            return age >= 18 && age <= 24;
          case 'Young Adult (25-30 yrs old)':
            return age >= 25 && age <= 30;
          default:
            return false;
        }
      });
      console.log('After age group filter:', filtered.length);
    }

    console.log('Final filtered data:', filtered.length);
    return filtered;
  }, [allYouthData, barangay, ageGroup, gender]);

  // Memoize the processed data to prevent re-calculation on every render
  const processedData = useMemo(() => {
    let totalAge = 0;
    let ageCount = 0;
    let skVoters = 0;
    let nationalVoters = 0;
    let votedLast = 0;
    let attendedKK = 0;
    let males = 0;
    let females = 0;

    const educationalLevels: { [key: string]: number } = {};
    const youthClassifications: { [key: string]: number } = {};
    const civilStatuses: { [key: string]: number } = {};
    const workLevels: { [key: string]: number } = {};
    const youthCountByYear: { [key: number]: number } = {};

    filteredYouthData.forEach(youth => {
      // Calculate age for average
      let age: number | null = null;
      
      if (youth.age && !isNaN(parseInt(youth.age))) {
        age = parseInt(youth.age);
      } else if (youth.birthday) {
        age = calculateAge(youth.birthday);
      }
      
      if (age !== null && !isNaN(age)) {
        totalAge += age;
        ageCount++;
      }

      // Metrics - convert string responses to boolean
      if (stringToBoolean(youth.registeredSkVoter)) skVoters++;
      if (stringToBoolean(youth.registeredNationalVoter)) nationalVoters++;
      if (stringToBoolean(youth.votedLastElection)) votedLast++;
      if (stringToBoolean(youth.attendedAssembly)) attendedKK++;
      
      // Gender counting (handle case variations)
      const genderLower = normalizeString(youth.gender);
      if (genderLower === 'male') males++;
      if (genderLower === 'female') females++;

      // Chart Data Aggregation
      const incrementCount = (obj: { [key: string]: number }, key: string) => {
        if (key && key.trim()) {
          const normalizedKey = key.trim();
          obj[normalizedKey] = (obj[normalizedKey] || 0) + 1;
        }
      };

      if (youth.educationalBackground) incrementCount(educationalLevels, youth.educationalBackground);
      if (youth.youthClassification) incrementCount(youthClassifications, youth.youthClassification);
      if (youth.civilStatus) incrementCount(civilStatuses, youth.civilStatus);
      if (youth.workStatus) incrementCount(workLevels, youth.workStatus);

      if (youth.createdAt) {
        try {
          const year = youth.createdAt.toDate().getFullYear();
          youthCountByYear[year] = (youthCountByYear[year] || 0) + 1;
        } catch (error) {
          console.warn('Error processing createdAt date:', error);
        }
      }
    });

    return {
      averageAge: ageCount > 0 ? Math.round(totalAge / ageCount) : 0,
      skVoterCount: skVoters,
      nationalVoterCount: nationalVoters,
      votedLastElectionCount: votedLast,
      attendedKKAssemblyCount: attendedKK,
      maleConstituents: males,
      femaleConstituents: females,
      educationalLevelChartData: Object.keys(educationalLevels).map(name => ({ name, value: educationalLevels[name] })),
      youthClassificationChartData: Object.keys(youthClassifications).map(name => ({ name, value: youthClassifications[name] })),
      civilStatusChartData: Object.keys(civilStatuses).map(name => ({ name, value: civilStatuses[name] })),
      workLevelChartData: Object.keys(workLevels).map(name => ({ name, value: workLevels[name] })),
      youthCountByYearChartData: Object.keys(youthCountByYear)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map(year => ({ name: year, value: youthCountByYear[parseInt(year)] })),
    };
  }, [filteredYouthData]);

  const {
    averageAge,
    skVoterCount,
    nationalVoterCount,
    votedLastElectionCount,
    attendedKKAssemblyCount,
    maleConstituents,
    femaleConstituents,
    educationalLevelChartData,
    youthClassificationChartData,
    civilStatusChartData,
    workLevelChartData,
    youthCountByYearChartData,
  } = processedData;

  if (loading) {
    return (
      <RequireAuth>
        <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] flex items-center justify-center">
          <p className="text-xl text-gray-700">Loading youth data...</p>
        </div>
      </RequireAuth>
    );
  }

  if (error) {
    return (
      <RequireAuth>
        <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] flex flex-col items-center justify-center">
          <p className="text-xl text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] flex flex-col gap-6 overflow-auto">
        {/* Header Section */}
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-gray-800">Youth Insights Dashboard</h1>
          <p className="text-lg text-gray-600 mt-2">
            Analyze youth profiling data to inform development plans.
          </p>
        </div>

        {/* Filter Section */}
        <div className="filter-section bg-white rounded-xl shadow-lg overflow-hidden p-6 mt-[-10px] mb-0">
          <h2 className="text-lg font-semibold text-gray-700 mb-2">Filter Audience by Demographics</h2>
          <div className="flex flex-wrap gap-4">
            {/* Barangay Dropdown */}
            <div className="flex flex-col flex-1 min-w-[190px] sm:min-w-[160px]">
              <label htmlFor="barangay" className="text-base font-bold text-[#002C84] mb-1">
                Barangay
              </label>
              <select
                name="barangay"
                id="barangay"
                className="p-2 border rounded-lg border-gray-300 text-sm bg-[#D0EFFF] w-full"
                value={barangay}
                onChange={(e) => setBarangay(e.target.value)}
              >
                <option value="All">All</option>
                <option value="Barangka">Barangka</option>
                <option value="Calumpang">Calumpang</option>
                <option value="Concepcion II (Dos)">Concepcion Dos</option>
                <option value="Concepcion I (Uno)">Concepcion Uno</option>
                <option value="Fortune">Fortune</option>
                <option value="Industrial Valley Complex (IVC)">Industrial Valley Complex (IVC)</option>
                <option value="Jesus Dela Peña">Jesus Dela Peña</option>
                <option value="Malanday">Malanday</option>
                <option value="Marikina Heights">Marikina Heights</option>
                <option value="Nangka">Nangka</option>
                <option value="Parang">Parang</option>
                <option value="San Roque">San Roque</option>
                <option value="Santa Elena">Santa Elena</option>
                <option value="Santo Niño">Santo Niño</option>
                <option value="Tañong">Tañong</option>
                <option value="Tumana">Tumana</option>
              </select>
            </div>

            {/* Age Group Dropdown */}
            <div className="flex flex-col flex-1 min-w-[190px] sm:min-w-[160px]">
              <label htmlFor="ageGroup" className="text-base font-bold text-[#002C84] mb-1">
                Age Group
              </label>
              <select
                name="ageGroup"
                id="ageGroup"
                className="p-2 border rounded-lg border-gray-300 text-sm bg-[#D0EFFF] w-full"
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
              >
                <option value="All">All</option>
                <option value="Child Youth (15-17 yrs old)">Child Youth (15-17 yrs old)</option>
                <option value="Core Youth (18-24 yrs old)">Core Youth (18-24 yrs old)</option>
                <option value="Young Adult (25-30 yrs old)">Young Adult (25-30 yrs old)</option>
              </select>
            </div>

            {/* Gender Dropdown */}
            <div className="flex flex-col flex-1 min-w-[190px] sm:min-w-[160px]">
              <label htmlFor="gender" className="text-base font-bold text-[#002C84] mb-1">
                Gender
              </label>
              <select
                name="gender"
                id="gender"
                className="p-2 border rounded-lg border-gray-300 text-sm bg-[#D0EFFF] w-full"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="All">All</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
          </div>
        </div>

        {/* Youth Count (Filtered) Area Graph */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-semibold text-gray-700 mb-4">Youth Count by Registration Year (Filtered)</h3>
          <div className="flex justify-center">
            <AreaChartComponent data={youthCountByYearChartData} />
          </div>
        </div>

        {/* Metrics Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-4">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-700">Average Age (Filtered)</h3>
            <p className="text-5xl font-bold text-gray-800">{averageAge}</p>
            <p className="text-sm text-gray-500 mt-2">Average age of matching youth</p>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-700">SK Voter</h3>
            <p className="text-5xl font-bold text-gray-800">{skVoterCount}</p>
            <p className="text-sm text-gray-500 mt-2">Registered SK voter</p>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-700">National Voter</h3>
            <p className="text-5xl font-bold text-gray-800">{nationalVoterCount}</p>
            <p className="text-sm text-gray-500 mt-2">Registered National Voters</p>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-700">Voted Last Election</h3>
            <p className="text-5xl font-bold text-gray-800">{votedLastElectionCount}</p>
            <p className="text-sm text-gray-500 mt-2">Participated in the Previous Election</p>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-700">Attended KK Assembly</h3>
            <p className="text-5xl font-bold text-gray-800">{attendedKKAssemblyCount}</p>
            <p className="text-sm text-gray-500 mt-2">Attended the KK Assembly</p>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-700">Male Constituents</h3>
            <p className="text-5xl font-bold text-gray-800">{maleConstituents}</p>
            <p className="text-sm text-gray-500 mt-2">Total male Kabataan</p>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-700">Female Constituents</h3>
            <p className="text-5xl font-bold text-gray-800">{femaleConstituents}</p>
            <p className="text-sm text-gray-500 mt-2">Total Female Kabataan</p>
          </div>
        </div>

        {/* BarCharts Section */}
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
            <div className="bg-white rounded-xl shadow-lg p-6 w-full">
              <h3 className="text-base font-semibold text-gray-700 mb-4 break-words">Youth Classification</h3>
              <BarChartComponent youthClassificationData={youthClassificationChartData} />
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 w-full">
              <h3 className="text-base font-semibold text-gray-700 mb-4 break-words">Civil Status Distribution</h3>
              <BarChartComponent civilStatusData={civilStatusChartData} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
            <div className="bg-white rounded-xl shadow-lg p-6 w-full">
              <h3 className="text-base font-semibold text-gray-700 mb-4 break-words">Work Status Distribution</h3>
              <BarChartComponent WorkstatusData={workLevelChartData} />
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 w-full">
              <h3 className="text-base font-semibold text-gray-700 mb-4 break-words">Educational Status Distribution</h3>
              <BarChartComponent educationalLevelData={educationalLevelChartData} />
            </div>
          </div>
        </div>
        <Navbar />
      </div>
    </RequireAuth>
  );
};

export default YouthInsightsDashboard;