package com.careerbridge.backend.model;

import java.util.List;

public record QuizQuestion(int id, String question, List<String> options) {
}