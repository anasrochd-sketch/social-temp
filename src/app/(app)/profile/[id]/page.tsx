import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileView } from "@/components/community/ProfileView";
import { getStudent, students } from "@/data/students";

interface PageProps {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return students.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const student = getStudent(id);
  return { title: student ? student.name : "Profile" };
}

export default async function StudentProfilePage({ params }: PageProps) {
  const { id } = await params;
  const student = getStudent(id);
  if (!student) notFound();
  return <ProfileView student={student} />;
}
