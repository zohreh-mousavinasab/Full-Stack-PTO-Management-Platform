Feature: Dashboard

  Scenario: Dashboard loads with workspace summary
    Given the user is authenticated
    When the dashboard loads
    Then it shows PTO stats, balances, recent requests, team snapshot, notifications, and conflicts

  Scenario: Dashboard falls back to the first available user when no token is present
    Given no bearer token is sent to the dashboard endpoint
    When the dashboard data is requested
    Then the API returns a valid dashboard payload for the first active user

  Scenario: Dashboard shows unread notification count
    Given unread notifications exist for the current user
    When the dashboard is rendered
    Then the sidebar badge shows the unread count
