'use client';
import { BarChart, Bar, ResponsiveContainer, YAxis, XAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const BarChartComponent = ({
  youthClassificationData,
  civilStatusData,
  WorkstatusData,
  educationalLevelData
}: {
  youthClassificationData?: { name: string; value: number }[];
  civilStatusData?: { name: string; value: number }[];
  WorkstatusData?: { name: string; value: number }[];
  educationalLevelData?: { name: string; value: number }[];
}) => {
  return (
    <div className="mb-8">
      {/* Conditional rendering for Youth Classification */}
      {youthClassificationData && (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={youthClassificationData} layout="vertical" margin={{left: 25, right: 20, top: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} />
            <XAxis />
            <Tooltip 
              content={({ payload }) => (
                <div>
                  <p>{payload?.[0]?.name}: {payload?.[0]?.value} number of constituents</p>
                </div>
              )}
            />
            <Legend 
              formatter={(value) => `${value} - number of constituents`} 
            />
            <Bar dataKey="value" fill="#CE1226" barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Conditional rendering for Civil Status */}
      {civilStatusData && (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={civilStatusData} layout="vertical" margin={{left: 20, right: 20, top: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} />
            <XAxis />
            <Tooltip 
              content={({ payload }) => (
                <div>
                  <p>{payload?.[0]?.name}: {payload?.[0]?.value} number of constituents</p>
                </div>
              )}
            />
            <Legend 
              formatter={(value) => `${value} - number of constituents`} 
            />
            <Bar dataKey="value" fill="#9E0A1A" barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Conditional rendering for Work Status */}
      {WorkstatusData && (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={WorkstatusData} layout="vertical" margin={{left: 25, right: 20, top: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} />
            <XAxis />
            <Tooltip 
              content={({ payload }) => (
                <div>
                  <p>{payload?.[0]?.name}: {payload?.[0]?.value} number of constituents</p>
                </div>
              )}
            />
            <Legend 
              formatter={(value) => `${value} - number of constituents`} 
            />
            <Bar dataKey="value" fill="#FF5733" barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Conditional rendering for Educational Level */}
      {educationalLevelData && (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={educationalLevelData} layout="vertical" margin={{ left: 20, right: 20, top: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} />
            <XAxis />
            <Tooltip 
              content={({ payload }) => (
                <div>
                  <p>{payload?.[0]?.name}: {payload?.[0]?.value} number of constituents</p>
                </div>
              )}
            />
            <Legend 
              formatter={(value) => `${value} - number of constituents`} 
            />
            <Bar dataKey="value" fill="#1167B1" barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default BarChartComponent;
