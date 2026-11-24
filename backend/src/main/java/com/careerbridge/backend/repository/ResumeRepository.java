package com.careerbridge.backend.repository;

import com.careerbridge.backend.model.Resume;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ResumeRepository extends JpaRepository<Resume, Long> {

    List<Resume> findByStudentId(Long studentId);
}