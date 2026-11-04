"use client";

import { uploadImage } from "@/components/records/ImageField";

/** Sube un póster del equipo (usado por la carga masiva de pósters). El campo de imagen vive en `components/records/ImageField`. */
export const uploadPoster = (file: File) => uploadImage(file, "poster", "team");
