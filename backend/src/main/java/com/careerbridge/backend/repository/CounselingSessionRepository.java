package com.careerbridge.backend.repository;

import com.careerbridge.backend.model.CounselingSession;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CounselingSessionRepository extends JpaRepository<CounselingSession, Long> {
    List<CounselingSession> findByStudentId(Long studentId);
}