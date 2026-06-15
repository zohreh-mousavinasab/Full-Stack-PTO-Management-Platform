Feature: Team Roster

  Scenario: Admin can view the user roster
    Given users exist in the database
    When the admin opens the roster panel
    Then the app lists each user name, email, and role

  Scenario: Team fallback is shown when no users are available
    Given the user list is empty
    When the roster panel renders
    Then the app shows the team list and member counts instead
