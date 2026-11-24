package com.careerbridge.backend.repository;

import com.careerbridge.backend.model.JobMatch;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface JobMatchRepository extends JpaRepository<JobMatch, Long> {
    List<JobMatch> findByStudentId(Long studentId);
}