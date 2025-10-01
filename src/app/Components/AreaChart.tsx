'use client';
import { useEffect, useState } from 'react';
import { db } from "@/app/Firebase/firebase";
import { collection, onSnapshot } from 'firebase/firestore';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

type ChartData = {
  name: string; // Month name
  count: number; // Number of users in that month
};

const BarChartComponent = () => {
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [, setApprovedCount] = useState<number>(0);

  useEffect(() => {
    const colRef = collection(db, "ApprovedUsers");
    const unsubscribe = onSnapshot(colRef, (querySnapshot) => {
      const thisYear = new Date().getFullYear();
      const monthCounts = Array(12).fill(0);
      let validDocCount = 0;

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        let approvedAt;
        if (data.approvedAt && typeof data.approvedAt.toDate === 'function') {
          approvedAt = data.approvedAt.toDate();
        } else if (data.approvedAt) {
          approvedAt = new Date(data.approvedAt);
        } else {
          console.warn('Document missing approvedAt:', doc.id);
          return;
        }
        validDocCount++;
        if (approvedAt.getFullYear() === thisYear) {
          const month = approvedAt.getMonth(); // 0 = Jan, 11 = Dec
          monthCounts[month]++;
        }
      });

      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const newChartData = months.map((m, i) => ({
        name: m,
        count: monthCounts[i],
      }));

      setChartData(newChartData);
      setApprovedCount(validDocCount);
    });

    return () => unsubscribe();
  }, []);

  return (
    <>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />

          {/* This Year Only */}
          <Bar dataKey="count" fill="#FFCC00" name="This Year" />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
};

export default BarChartComponent;
