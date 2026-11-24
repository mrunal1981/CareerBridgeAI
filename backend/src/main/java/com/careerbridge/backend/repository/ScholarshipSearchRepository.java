package com.careerbridge.backend.repository;

import com.careerbridge.backend.model.ScholarshipSearch;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ScholarshipSearchRepository extends JpaRepository<ScholarshipSearch, Long> {
    List<ScholarshipSearch> findByStudentId(Long studentId);
}