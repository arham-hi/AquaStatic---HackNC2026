import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/** Grounded strength label for the real 0-1 match score (threshold is 0.55). */
export const matchStrength = (score: number) => (score >= 0.85 ? "Strong match" : score >= 0.7 ? "Good match" : "Possible match");
