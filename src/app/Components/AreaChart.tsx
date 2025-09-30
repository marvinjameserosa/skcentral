'use client';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

type ChartData = {
  name: string;
  value: number;
};

const AreaChartComponent = ({ data }: { data: ChartData[] }) => {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        
        {/* Core Youth Count Area (Yellow) */}
        <Area
          type="monotone"
          dataKey="value"
          stroke="#FFCC00" // Yellow for Core Youth
          fill="#FFCC00" // Same Yellow fill for the area
          name="Core Youth"
          dot={false} // Remove the dots on the line
        />
        
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default AreaChartComponent;
