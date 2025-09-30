"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";

type Children =
  | React.ReactNode
  | ((user: User) => React.ReactNode);

interface RequireAuthProps {
  children: Children;
  redirectTo?: string;
  requireEmailVerification?: boolean;
  loadingComponent?: React.ReactNode;
  onAuthSuccess?: (user: User) => void;
  onAuthFailure?: () => void;
}

const RequireAuth: React.FC<RequireAuthProps> = ({ 
  children, 
  // Default to a safe path
  redirectTo = "/login",
  requireEmailVerification = false,
  loadingComponent = <p>Loading...</p>,
  onAuthSuccess,
  onAuthFailure,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        if (requireEmailVerification && !u.emailVerified) {
          setIsAuthenticated(false);
          router.push("/verify-email");
          onAuthFailure?.();
          return;
        }
        setUser(u);
        setIsAuthenticated(true);
        onAuthSuccess?.(u);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        if (redirectTo) router.push(redirectTo);
        onAuthFailure?.();
      }
    });

    return () => unsubscribe();
  }, [router, redirectTo, requireEmailVerification, onAuthSuccess, onAuthFailure]);

  if (isAuthenticated === null) {
    return <>{loadingComponent}</>;
  }

  if (isAuthenticated && user) {
    return (
      <>
        {typeof children === "function" ? (children as (u: User) => React.ReactNode)(user) : children}
      </>
    );
  }

  return null;
};

export default RequireAuth;
