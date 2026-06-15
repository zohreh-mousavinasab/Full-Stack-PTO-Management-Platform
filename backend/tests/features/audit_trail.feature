Feature: Audit Trail

  Scenario: System records user creation
    Given a new user is created through the API
    When the transaction completes
    Then an audit log is stored with action create and entity user

  Scenario: System records request creation and review actions
    Given a PTO request is created, approved, rejected, or cancelled
    When the action completes
    Then the audit log captures the actor, action, entity, entity ID, and details

  Scenario: Audit log feed returns recent entries
    Given audit logs exist
    When the audit log endpoint is requested
    Then the most recent entries are returned first
    And the result is limited to the latest 100 records
