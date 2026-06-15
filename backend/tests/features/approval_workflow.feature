Feature: Approval Workflow

  Scenario: Manager approves a pending request
    Given a request is in pending status
    And a valid reviewer exists
    When the reviewer approves the request
    Then the request status becomes approved
    And available balance decreases by the number of working days
    And pending balance decreases
    And the employee receives an approval notification
    And an audit log entry is created

  Scenario: Manager rejects a pending request
    Given a request is in pending status
    And a valid reviewer exists
    When the reviewer rejects the request
    Then the request status becomes rejected
    And pending balance decreases by the request days
    And the employee receives a rejection notification
    And an audit log entry is created

  Scenario: Approved request cannot be approved again
    Given a request is already approved
    When a reviewer tries to approve it again
    Then the API returns a 400 response
    And the request remains unchanged

  Scenario: Pending request can be cancelled
    Given a request is in pending status
    When the requester or reviewer cancels it
    Then the request status becomes cancelled
    And pending balance is reduced
    And the employee receives a cancellation notification

  Scenario: Approved request can be cancelled and balance is restored
    Given a request is in approved status
    When the request is cancelled
    Then available balance is restored by the request days
    And the request status becomes cancelled
