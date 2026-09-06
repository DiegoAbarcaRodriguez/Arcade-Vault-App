import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export default function Auth() {
  return (
    <Suspense fallback={null}>
      <AuthForm />
    </Suspense>
  );
}
