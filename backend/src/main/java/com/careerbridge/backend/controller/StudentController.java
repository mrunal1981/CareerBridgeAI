package com.careerbridge.backend.controller;

import com.careerbridge.backend.model.LoginRequest;
import com.careerbridge.backend.model.ProfileRequest;
import com.careerbridge.backend.model.Student;
import com.careerbridge.backend.repository.StudentRepository;
import com.careerbridge.backend.security.CurrentUser;
import com.careerbridge.backend.security.JwtService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/students")
public class StudentController {

    private final StudentRepository studentRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public StudentController(StudentRepository studentRepository,
                             PasswordEncoder passwordEncoder,
                             JwtService jwtService) {
        this.studentRepository = studentRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @PostMapping("/signup")
    public Map<String, Object> createStudent(@RequestBody Student student) {

        if (student.getName() == null || student.getName().isBlank()
                || student.getEmail() == null || student.getEmail().isBlank()
                || student.getPassword() == null || student.getPassword().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "name, email and password must not be empty");
        }
        student.setEmail(student.getEmail().trim());
        if (!student.getEmail().matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please enter a valid email address");
        }
        if (student.getPassword().length() < 6) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password must be at least 6 characters");
        }
        if (studentRepository.findByEmail(student.getEmail()).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "An account with this email already exists");
        }

        student.setId(null);
        student.setPassword(passwordEncoder.encode(student.getPassword()));
        return withToken(studentRepository.save(student));
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody LoginRequest request) {

        if (request.getEmail() == null || request.getPassword() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "email and password must not be empty");
        }

        Student student = studentRepository.findByEmail(request.getEmail().trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                        "Invalid email or password"));

        if (!passwordEncoder.matches(request.getPassword(), student.getPassword())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Invalid email or password");
        }

        return withToken(student);
    }

    @GetMapping("/{id}")
    public Student getStudent(@PathVariable("id") Long id) {
        CurrentUser.requireSelf(id);
        return studentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Student not found"));
    }

    // Saves stream / marks / category / state / city. Only the fields that are sent are changed.
    @PutMapping("/{id}/profile")
    public Student updateProfile(@PathVariable("id") Long id, @Valid @RequestBody ProfileRequest p) {
        CurrentUser.requireSelf(id);
        Student s = studentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Student not found"));

        if (p.getStream() != null && !p.getStream().isBlank()) s.setStream(p.getStream().trim());
        if (p.getMarks() != null) s.setMarks(p.getMarks());
        if (p.getIncomeCategory() != null && !p.getIncomeCategory().isBlank()) s.setIncomeCategory(p.getIncomeCategory().trim());
        if (p.getState() != null && !p.getState().isBlank()) s.setState(p.getState().trim());
        if (p.getCity() != null && !p.getCity().isBlank()) s.setCity(p.getCity().trim());
        return studentRepository.save(s);
    }

    // Same student fields the frontend already knows, plus the token. The password is never included.
    private Map<String, Object> withToken(Student s) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", s.getId());
        out.put("name", s.getName());
        out.put("email", s.getEmail());
        out.put("stream", s.getStream());
        out.put("marks", s.getMarks());
        out.put("incomeCategory", s.getIncomeCategory());
        out.put("state", s.getState());
        out.put("city", s.getCity());
        out.put("token", jwtService.createToken(s.getId(), s.getEmail()));
        return out;
    }
}