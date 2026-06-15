Feature: Policies

  Scenario: Admin creates a PTO policy
    Given an admin is on the policy screen
    When the admin creates a policy with type, rate, frequency, carryover cap, and max balance
    Then the policy is saved successfully
    And an audit log entry is created

  Scenario: Admin updates an existing policy
    Given an existing policy is selected
    When the admin updates its fields
    Then the policy is saved with a new updated timestamp
    And an audit log entry is created

  Scenario: Policy list is available to the dashboard
    Given policies exist in the database
    When the dashboard loads
    Then the user can see the active policy list
