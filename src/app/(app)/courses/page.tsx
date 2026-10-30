
import type { Metadata } from "next";
import { CoursesPageContent } from "@/components/learning/CoursesPageContent";

export const metadata: Metadata = { title: "Courses" };

export default function CoursesPage() {
  return <CoursesPageContent />;
}
