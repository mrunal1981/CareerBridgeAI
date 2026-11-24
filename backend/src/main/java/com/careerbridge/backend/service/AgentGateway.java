package com.careerbridge.backend.service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Component
public class AgentGateway {

    private final RestClient client;

    public AgentGateway(@Qualifier("agentRestClient") RestClient client) {
        this.client = client;
    }

    public Map<String, Object> post(String path, Map<String, Object> body) {
        try {
            Map<String, Object> result = client.post()
                    .uri(path)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(new ParameterizedTypeReference<Map<String, Object>>() {});
            if (result == null) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "AI agent returned an empty response");
            }
            return result;
        } catch (RestClientResponseException e) {
            // The agent answered with an error status (bad input, LLM failure, missing key...)
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "AI agent could not complete the request (status " + e.getStatusCode().value() + ")");
        } catch (RestClientException e) {
            // Connection refused or timeout
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "AI agent service is not reachable");
        }
    }

    public static List<String> strings(Object value) {
        List<String> out = new ArrayList<>();
        if (value instanceof List<?> list) {
            for (Object item : list) {
                out.add(String.valueOf(item));
            }
        }
        return out;
    }
}