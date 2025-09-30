"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "../../../Components/Navbar";

export default function OfficialReceiptCompilation() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    const storedUrl = sessionStorage.getItem("generatedPDFUrl");
    if (storedUrl) {
      setPdfUrl(storedUrl);
    }
  }, []);

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-800">Transparency Report</h1>
        <p className="text-lg text-gray-600 mt-1">
          Create reports and activities for internal tracking.
        </p>
      </div>

      <div className="w-full bg-white rounded-xl shadow-md">
        <div className="relative bg-[#1167B1] text-white px-6 py-4 rounded-t-xl">
          <Link href="/transparency-report/Documentation-Report">
            <button className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl hover:opacity-80">←</button>
          </Link>
          <h2 className="text-center text-3xl font-bold">Documentation Report</h2>
        </div>

        <div className="bg-white rounded-b-xl p-8 flex flex-col items-center">
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-[500px] border rounded-xl"
              title="PDF Preview"
            ></iframe>
          ) : (
            <p className="text-gray-500">No PDF generated yet.</p>
          )}

          <div className="mt-6 flex gap-4">
            {pdfUrl && (
              <>
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#FFD700] hover:bg-[#f2c200] text-black font-semibold py-2 px-6 rounded-lg shadow"
                >
                  View
                </a>
                <a
                  href={pdfUrl}
                  download="DocumentationReport.pdf"
                  className="bg-[#1167B1] hover:bg-[#0e5ca0] text-white font-semibold py-2 px-6 rounded-lg shadow"
                >
                  Download
                </a>
              </>
            )}
          </div>
        </div>
      </div>
      <Navbar />
    </div>
  );
}
