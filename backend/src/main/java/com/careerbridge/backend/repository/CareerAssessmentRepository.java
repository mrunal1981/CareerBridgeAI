package com.careerbridge.backend.repository;

import com.careerbridge.backend.model.CareerAssessment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CareerAssessmentRepository extends JpaRepository<CareerAssessment, Long> {
    List<CareerAssessment> findByStudentIdOrderByUpdatedAtDesc(Long studentId);

    // Always look records up together with the owner, so one student can never read another's.
    Optional<CareerAssessment> findByIdAndStudentId(Long id, Long studentId);
}