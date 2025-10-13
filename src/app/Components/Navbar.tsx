"use client"; // Ensures this is a client-side component
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { getAuth } from 'firebase/auth';
import { db } from "@/app/Firebase/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

// Define all available modules with their details
const allModules = [
  {
    id: "youth-profiling",
    title: "Youth Profiling",
    href: "/youth-profiling",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 640 640" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M192 64C156.7 64 128 92.7 128 128L128 512C128 547.3 156.7 576 192 576L448 576C483.3 576 512 547.3 512 512L512 234.5C512 217.5 505.3 201.2 493.3 189.2L386.7 82.7C374.7 70.7 358.5 64 341.5 64L192 64zM453.5 240L360 240C346.7 240 336 229.3 336 216L336 122.5L453.5 240z"/>
      </svg>
    ),
  },
  {
    id: "chat",
    title: "Chat",
    href: "/chat",
    icon: (
      <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M2 6a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H7l-5 4V6z"/>
        <circle cx="8" cy="10" r="1.5"/>
        <circle cx="12" cy="10" r="1.5"/>
        <circle cx="16" cy="10" r="1.5"/>
      </svg>
    ),
  },
  {
    id: "announcement",
    title: "Announcement",
    href: "/announcement",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M16.881 4.345A23.112 23.112 0 0 1 8.25 6H7.5a5.25 5.25 0 0 0-.88 10.427 21.593 21.593 0 0 0 1.378 3.94c.464 1.004 1.674 1.32 2.582.796l.657-.379c.88-.508 1.165-1.593.772-2.468a17.116 17.116 0 0 1-.628-1.607c1.918.258 3.76.75 5.5 1.446A21.727 21.727 0 0 0 18 11.25c0-2.414-.393-4.735-1.119-6.905ZM18.26 3.74a23.22 23.22 0 0 1 1.24 7.51 23.22 23.22 0 0 1-1.41 7.992.75.75 0 1 0 1.409.516 24.555 24.555 0 0 0 1.415-6.43 2.992 2.992 0 0 0 .836-2.078c0-.807-.319-1.54-.836-2.078a24.65 24.65 0 0 0-1.415-6.43.75.75 0 1 0-1.409.516c.059.16.116.321.17.483Z"/>
      </svg>
    ),
  },
  {
    id: "community-event",
    title: "Community Event",
    href: "/community-event",
    icon: (
      <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm6 2c1.1 0 2 .9 2 2v4H4v-4c0-1.1.9-2 2-2h12z"/>
      </svg>
    ),
  },
  {
    id: "job-listing",
    title: "Job Listing",
    href: "/job-listing",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 640 640" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M264 112L376 112C380.4 112 384 115.6 384 120L384 160L256 160L256 120C256 115.6 259.6 112 264 112zM208 120L208 544L432 544L432 120C432 89.1 406.9 64 376 64L264 64C233.1 64 208 89.1 208 120zM480 160L480 544L512 544C547.3 544 576 515.3 576 480L576 224C576 188.7 547.3 160 512 160L480 160zM160 544L160 160L128 160C92.7 160 64 188.7 64 224L64 480C64 515.3 92.7 544 128 544L160 544z"/>
      </svg>
    ),
  },
  {
    id: "scholarship-listing",
    title: "Scholarship Listing",
    href: "/scholarship-listing",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 640 640" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M80 259.8L289.2 345.9C299 349.9 309.4 352 320 352C330.6 352 341 349.9 350.8 345.9L593.2 246.1C602.2 242.4 608 233.7 608 224C608 214.3 602.2 205.6 593.2 201.9L350.8 102.1C341 98.1 330.6 96 320 96C309.4 96 299 98.1 289.2 102.1L46.8 201.9C37.8 205.6 32 214.3 32 224L32 520C32 533.3 42.7 544 56 544C69.3 544 80 533.3 80 520L80 259.8zM128 331.5L128 448C128 501 214 544 320 544C426 544 512 501 512 448L512 331.4L369.1 390.3C353.5 396.7 336.9 400 320 400C303.1 400 286.5 396.7 270.9 390.3L128 331.4z"/>
      </svg>
    ),
  },
  {
    id: "transparency-report",
    title: "Transparency Report",
    href: "/transparency-report",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 640 640" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M256 144C256 117.5 277.5 96 304 96L336 96C362.5 96 384 117.5 384 144L384 496C384 522.5 362.5 544 336 544L304 544C277.5 544 256 522.5 256 496L256 144zM64 336C64 309.5 85.5 288 112 288L144 288C170.5 288 192 309.5 192 336L192 496C192 522.5 170.5 544 144 544L112 544C85.5 544 64 522.5 64 496L64 336zM496 160L528 160C554.5 160 576 181.5 576 208L576 496C576 522.5 554.5 544 528 544L496 544C469.5 544 448 522.5 448 496L448 208C448 181.5 469.5 160 496 160z"/>
      </svg>
    ),
  },
  {
    id: "learning-hub",
    title: "Learning Hub",
    href: "/learningHub",
    icon: (
      <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 2a1 1 0 01.832.445l7 10a1 1 0 01-.832 1.555H3a1 1 0 01-.832-1.555l7-10A1 1 0 0110 2zm0 2.618L4.068 12h11.864L10 4.618zM8 13a2 2 0 114 0v1H8v-1z" />
      </svg>
    ),
  },
  {
    id: "feedbacks",
    title: "Feedbacks",
    href: "/sentiment-analyzer",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 640 640" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M96 128C96 92.7 124.7 64 160 64L448 64C483.3 64 512 92.7 512 128L512 176L448 176L448 128L160 128L160 320L272 320L272 416L108.8 416C66.4 416 32 381.6 32 339.2C32 328.6 40.6 320 51.2 320L96 320L96 128zM561.9 321.9C570.9 330.9 576 343.1 576 355.8L576 528C576 554.5 554.5 576 528 576L368 576C341.5 576 320 554.5 320 528L320 272C320 245.5 341.5 224 368 224L444.1 224C456.8 224 469 229.1 478 238.1C498 258.1 525.9 286 561.9 322zM448 336C448 344.8 455.2 352 464 352L524.1 352L448 275.9L448 336z"/>
      </svg>
    ),
  },
  {
    id: "podcast",
    title: "Podcast",
    href: "/LivePodcast",
    icon: (
      <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm5 10a5 5 0 0 1-10 0H5a7 7 0 0 0 14 0h-2zm-5 7v3h2v-3h-2z"/>
      </svg>
    ),
  },
  {
    id: "member-approval",
    title: "Member Approval",
    href: "/member-approval",
    icon: (
      <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2l8 4v6c0 5.25-3.5 10-8 10S4 17.25 4 12V6l8-4z"/>
      </svg>
    ),
  },
  {
    id: "user",
    title: "User",
    href: "/user",
    icon: (
      <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z"/>
      </svg>
    ),
  },
];

const Navbar = () => {
  const pathname = usePathname();
  const auth = getAuth();
  const [user, loading] = useAuthState(auth);
  const [, setUserModules] = useState<string[]>([]);
  const [filteredModules, setFilteredModules] = useState(allModules);

  const isActive = (route: string) =>
    pathname.toLowerCase().startsWith(route.toLowerCase()) || pathname.includes(route.toLowerCase());

  // Fetch user's module permissions
  useEffect(() => {
    const fetchUserModules = async () => {
      if (user) {
        try {
          const q = query(
            collection(db, "adminUsers"),
            where("uid", "==", user.uid)
          );
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            const userData = querySnapshot.docs[0].data();
            const modules = userData.modules || [];
            setUserModules(modules);
            
            // Filter modules based on user permissions
            const allowedModules = allModules.filter(module => 
              modules.includes(module.id)
            );
            setFilteredModules(allowedModules);
          } else {
            // If user not found in adminUsers collection, show default modules
            const defaultModules = ["youth-profiling", "podcast", "member-approval", "user"];
            setUserModules(defaultModules);
            const allowedModules = allModules.filter(module => 
              defaultModules.includes(module.id)
            );
            setFilteredModules(allowedModules);
          }
        } catch (error) {
          console.error("Error fetching user modules:", error);
          // Fallback to default modules on error
          const defaultModules = ["youth-profiling", "podcast", "member-approval", "user"];
          setUserModules(defaultModules);
          const allowedModules = allModules.filter(module => 
            defaultModules.includes(module.id)
          );
          setFilteredModules(allowedModules);
        }
      } else if (!loading) {
        // User not authenticated, show default modules
        const defaultModules = ["youth-profiling", "podcast", "member-approval", "user"];
        setUserModules(defaultModules);
        const allowedModules = allModules.filter(module => 
          defaultModules.includes(module.id)
        );
        setFilteredModules(allowedModules);
      }
    };

    fetchUserModules();
  }, [user, loading]);

  // Show loading state
  if (loading) {
    return (
      <aside className="bg-[#1167B1] text-white flex flex-col gap-2.5 py-8 px-4 w-64 fixed left-0 top-0 h-full">
        <div className="text-center mb-4">
          <Link href="/Home">
            <Image src="/SKLogo.png" alt="Logo" width={240} height={240} />
          </Link>
        </div>
        <div className="flex items-center justify-center text-white">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="bg-[#1167B1] text-white flex flex-col gap-2.5 py-8 px-4 w-64 fixed left-0 top-0 h-full">
      <div className="text-center mb-4">
        <Link href="/Home">
          <Image src="/SKLogo.png" alt="Logo" width={240} height={240} />
        </Link>
      </div>

      {/* Render filtered modules */}
      {filteredModules.map((mod) => (
        <Link key={mod.id} href={mod.href}>
          <button className={`text-left w-full hover:bg-white hover:text-[#002C84] transition-colors rounded-md py-2 px-4 ${isActive(mod.href) ? 'bg-white text-[#002C84]' : 'text-white'}`}>
            <div className="flex items-center space-x-2">
              {mod.icon}
              <span>{mod.title}</span>
            </div>
          </button>
        </Link>
      ))}

    </aside>
  );
};

export default Navbar;