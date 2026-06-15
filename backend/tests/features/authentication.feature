Feature: Authentication

  Scenario: User logs in with valid credentials
    Given a seeded user account exists
    When the user submits a valid email and password
    Then the API returns an access token
    And the response includes the current user profile

  Scenario: User cannot log in with invalid credentials
    Given a seeded user account exists
    When the user submits an incorrect password
    Then the API returns a 401 response
    And the response shows invalid credentials

  Scenario: Authenticated user can load their profile
    Given the user is authenticated with a bearer token
    When the user requests the current profile
    Then the API returns the user identity, role, team_id, and manager_id

  Scenario: Anonymous user is redirected away from protected routes
    Given no token is stored in the browser
    When the user opens a protected page
    Then the app redirects to the login experience

  Scenario: User can request password recovery
    Given a user email exists in the system
    When the user submits a forgot-password request
    Then the API returns a success message
    And a reminder notification is created for that user
